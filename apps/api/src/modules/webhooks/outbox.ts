import type { Prisma } from "@prisma/client";
import type { WebhookEvent } from "@moyapay/shared";
import type { Db } from "../../db/prisma";
import { randomId } from "../../lib/ids";

export interface WebhookEnvelope {
  id: string;
  type: WebhookEvent | "ping";
  createdAt: string;
  data: Record<string, unknown>;
}

/**
 * Queues a status webhook if the merchant has a URL and subscribed to the event. Called inside
 * the transaction that made the change (an outbox), so a webhook is sent if and only if the
 * change committed. The worker delivers it.
 */
export async function enqueueWebhook(
  db: Db,
  merchantId: string,
  event: WebhookEvent | "ping",
  data: Record<string, unknown>,
): Promise<string | null> {
  const merchant = await db.merchant.findUnique({
    where: { id: merchantId },
    select: { webhookUrl: true, webhookEvents: true },
  });
  if (!merchant?.webhookUrl) return null;
  if (event !== "ping" && !merchant.webhookEvents.includes(event)) return null;
  const id = `evt_${randomId(15)}`;
  const envelope: WebhookEnvelope = { id, type: event, createdAt: new Date().toISOString(), data };
  await db.webhookDelivery.create({
    data: {
      id,
      merchantId,
      event,
      payload: JSON.parse(JSON.stringify(envelope)) as Prisma.InputJsonObject,
    },
  });
  return id;
}
