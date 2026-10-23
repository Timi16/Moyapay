import type { PrismaClient } from "@prisma/client";
import { serializeRequest } from "../modules/requests/serialize";
import { lockRequestById, markExpired } from "../modules/transitions";
import { enqueueWebhook } from "../modules/webhooks/outbox";

export const EXPIRY_INTERVAL_MS = 60_000;

/**
 * Every minute: PENDING or FAILED requests whose expiresAt has passed become EXPIRED, but only
 * once the watcher has processed that destination past expiresAt (syncedAt). If the watcher
 * lags or is down, expiry waits for it, so a request paid in time is never expired early.
 */
export async function expireOverdue(prisma: PrismaClient, now: Date = new Date()): Promise<number> {
  // Only requests whose destination is synced past expiresAt are candidates, so one stuck
  // destination with many overdue requests can't crowd everyone else out of the batch.
  // Times go in as ISO text cast to timestamp (columns hold UTC wall time).
  const due = await prisma.$queryRaw<{ id: string; syncedAt: Date }[]>`
    SELECT r."id", c."syncedAt"
    FROM "PaymentRequest" r
    JOIN "WatcherCursor" c ON c."destination" = r."destination"
    WHERE r."status" IN ('PENDING', 'FAILED')
      AND r."expiresAt" < ${now.toISOString()}::timestamp
      AND c."syncedAt" IS NOT NULL
      AND r."expiresAt" < c."syncedAt"
    ORDER BY r."expiresAt"
    LIMIT 500`;

  let expired = 0;
  for (const { id, syncedAt } of due) {
    const cutoff = new Date(Math.min(now.getTime(), syncedAt.getTime()));
    const done = await prisma.$transaction(async (tx) => {
      // Re-checked under the lock: a payment may have landed since the select.
      const req = await lockRequestById(tx, id);
      if (!req) return false;
      const updated = await markExpired(tx, id, cutoff);
      if (!updated) return false;
      await enqueueWebhook(tx, updated.merchantId, "request.expired", { request: serializeRequest(updated) });
      return true;
    });
    if (done) expired++;
  }
  return expired;
}
