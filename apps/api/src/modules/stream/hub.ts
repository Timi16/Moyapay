import type { PrismaClient } from "@prisma/client";
import type { Checkout } from "@moyapay/shared";
import type { Logger } from "pino";
import {
  CHANNELS,
  type Channel,
  type PaymentRecordedPayload,
  type RequestUpdatedPayload,
} from "../../db/notify";
import { serializeCheckout, serializePayment, serializeRequest } from "../requests/serialize";

export type MerchantEvent = {
  type: "request.updated" | "payment.recorded" | "resync";
  data: unknown;
};
type PublicListener = (checkout: Checkout) => void;
type MerchantListener = (event: MerchantEvent) => void;

function add<K, V>(map: Map<K, Set<V>>, key: K, value: V): () => void {
  let set = map.get(key);
  if (!set) map.set(key, (set = new Set()));
  set.add(value);
  return () => {
    set.delete(value);
    if (set.size === 0 && map.get(key) === set) map.delete(key);
  };
}

/**
 * Fans Postgres notifications out to SSE subscribers held in memory. A notification only
 * carries ids; the hub reads the committed row and sends that, so subscribers always get the
 * database's truth.
 */
export class LiveHub {
  private readonly publicSubs = new Map<string, Set<PublicListener>>();
  private readonly merchantSubs = new Map<string, Set<MerchantListener>>();
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger,
  ) {}

  subscribePublic(reference: string, fn: PublicListener): () => void {
    return add(this.publicSubs, reference, fn);
  }

  subscribeMerchant(merchantId: string, fn: MerchantListener): () => void {
    return add(this.merchantSubs, merchantId, fn);
  }

  /**
   * Notifications are handled strictly one after another: each re-reads the row, and two
   * reads handled concurrently could emit the older one last and leave a stale status.
   */
  handleNotification = (channel: Channel, payload: unknown): void => {
    this.queue = this.queue
      .then(() => this.dispatch(channel, payload))
      .catch((err: unknown) => this.logger.error({ err, channel }, "live hub: dispatch failed"));
  };

  /** After the LISTEN connection reconnects: notifications may have been lost, so resend. */
  resync = (): void => {
    for (const merchantId of this.merchantSubs.keys()) this.emitMerchant(merchantId, { type: "resync", data: {} });
    for (const reference of [...this.publicSubs.keys()]) {
      this.queue = this.queue
        .then(() => this.pushCheckout(reference))
        .catch((err: unknown) => this.logger.warn({ err }, "live hub: resync failed"));
    }
  };

  private async pushCheckout(reference: string): Promise<void> {
    const subs = this.publicSubs.get(reference);
    if (!subs) return;
    const req = await this.prisma.paymentRequest.findUnique({ where: { reference } });
    if (!req) return;
    const [merchant, last] = await Promise.all([
      this.prisma.merchant.findUniqueOrThrow({ where: { id: req.merchantId }, select: { name: true } }),
      this.prisma.incomingPayment.findFirst({ where: { requestId: req.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    ]);
    const checkout = serializeCheckout(req, merchant, last);
    for (const fn of subs) fn(checkout);
  }

  private emitMerchant(merchantId: string, event: MerchantEvent): void {
    for (const fn of this.merchantSubs.get(merchantId) ?? []) fn(event);
  }

  private async dispatch(channel: Channel, payload: unknown): Promise<void> {
    if (typeof payload !== "object" || payload === null) return;
    if (channel === CHANNELS.requestUpdated) {
      const p = payload as Partial<RequestUpdatedPayload>;
      if (!p.id || !p.reference || !p.merchantId) return;
      await this.pushCheckout(p.reference);
      if (!this.merchantSubs.has(p.merchantId)) return;
      const req = await this.prisma.paymentRequest.findUnique({ where: { id: p.id } });
      if (req) this.emitMerchant(req.merchantId, { type: "request.updated", data: serializeRequest(req) });
    } else if (channel === CHANNELS.paymentRecorded) {
      const p = payload as Partial<PaymentRecordedPayload>;
      if (!p.id || !p.merchantId) return;
      const payment = await this.prisma.incomingPayment.findFirst({
        where: { id: p.id, merchantId: p.merchantId },
        include: { request: { select: { reference: true } } },
      });
      if (!payment) return;
      // A flagged payment (wrong amount, failed) changes what the checkout shows too.
      if (payment.request) await this.pushCheckout(payment.request.reference);
      this.emitMerchant(p.merchantId, { type: "payment.recorded", data: serializePayment(payment) });
    }
  }
}
