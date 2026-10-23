import type { PrismaClient } from "@prisma/client";
import type { Logger } from "pino";
import { webhookSecret } from "../lib/ids";
import { signPayload } from "../lib/hmac";
import type { SafeHttpClient } from "../lib/safeHttp";

export const DELIVERY_INTERVAL_MS = 2000;
/** Wait before attempt n+1 after attempt n failed. After the last one the delivery is FAILED. */
export const RETRY_DELAYS_SECONDS = [10, 60, 300, 1800, 7200, 21_600];
export const MAX_ATTEMPTS = RETRY_DELAYS_SECONDS.length + 1;
/** A claimed delivery is retried after this if the worker died mid-send. */
const LEASE_MS = 60_000;
const BATCH = 20;

export interface DeliveryDeps {
  prisma: PrismaClient;
  http: SafeHttpClient;
  logger: Logger;
}

export function webhookHeaders(secret: string, id: string, attempt: number, rawBody: string, timestamp: number) {
  return {
    "Content-Type": "application/json",
    "User-Agent": "MoyaPay-Webhooks/1.0",
    "MoyaPay-Id": id, // the same on every retry
    "MoyaPay-Timestamp": String(timestamp),
    "MoyaPay-Attempt": String(attempt),
    "MoyaPay-Signature": `v1=${signPayload(secret, timestamp, rawBody)}`,
  };
}

/** Sends due deliveries once. Returns how many were attempted. */
export async function deliverDue(deps: DeliveryDeps, now = new Date()): Promise<number> {
  const { prisma, http, logger } = deps;
  // Times go in as ISO text cast to timestamp: columns are UTC wall time, and this keeps the
  // comparison independent of the session time zone.
  // Claim: push nextAttemptAt out by the lease so a second worker (or a restart) skips them.
  const claimed = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "WebhookDelivery" SET "nextAttemptAt" = ${new Date(now.getTime() + LEASE_MS).toISOString()}::timestamp
    WHERE "id" IN (
      SELECT "id" FROM "WebhookDelivery"
      WHERE "status" = 'PENDING' AND "nextAttemptAt" <= ${now.toISOString()}::timestamp
      ORDER BY "nextAttemptAt" LIMIT ${BATCH}
      FOR UPDATE SKIP LOCKED)
    RETURNING "id"`;
  for (const { id } of claimed) {
    const d = await prisma.webhookDelivery.findUnique({
      where: { id },
      include: { merchant: { select: { webhookUrl: true, webhookSecretVersion: true } } },
    });
    if (!d) continue;
    if (!d.merchant.webhookUrl) {
      await prisma.webhookDelivery.update({
        where: { id },
        data: { status: "FAILED", lastError: "Webhook URL was removed" },
      });
      continue;
    }
    const attempt = d.attempts + 1;
    const rawBody = JSON.stringify(d.payload);
    const secret = webhookSecret(d.merchantId, d.merchant.webhookSecretVersion);
    const timestamp = Math.floor(Date.now() / 1000);
    const res = await http.post(d.merchant.webhookUrl, webhookHeaders(secret, d.id, attempt, rawBody, timestamp), rawBody);
    const ok = res.error === null && res.statusCode !== null && res.statusCode >= 200 && res.statusCode < 300;
    const delay = RETRY_DELAYS_SECONDS[attempt - 1];
    const lastError = ok ? null : (res.error ?? `HTTP ${res.statusCode ?? "?"}`);
    await prisma.webhookDelivery.update({
      where: { id },
      data: {
        attempts: attempt,
        lastStatusCode: res.statusCode,
        lastError,
        ...(ok
          ? { status: "DELIVERED", deliveredAt: new Date() }
          : delay === undefined
            ? { status: "FAILED" }
            : { nextAttemptAt: new Date(Date.now() + delay * 1000) }),
      },
    });
    if (!ok) logger.info({ deliveryId: id, attempt, lastError }, "webhook delivery failed");
  }
  return claimed.length;
}
