import type { PaymentRequest } from "@prisma/client";
import type { Checkout } from "@moyapay/shared";
import type { AppDeps } from "../../deps";
import { verifyTransaction } from "../../engine/verify";
import { notFound } from "../../lib/errors";
import { serializeCheckout } from "../requests/serialize";
import { addEvent } from "../transitions";

/** CHECKOUT_OPENED is recorded at most this often per request (the page polls every 3 s). */
const OPENED_EVERY_MS = 30 * 60_000;

export function createPublicService(deps: AppDeps) {
  const { prisma } = deps;

  async function load(reference: string): Promise<PaymentRequest> {
    const req = await prisma.paymentRequest.findUnique({ where: { reference } });
    if (!req) throw notFound("Payment request");
    return req;
  }

  async function checkout(req: PaymentRequest): Promise<Checkout> {
    const [merchant, last] = await Promise.all([
      prisma.merchant.findUniqueOrThrow({ where: { id: req.merchantId }, select: { name: true } }),
      prisma.incomingPayment.findFirst({ where: { requestId: req.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    ]);
    return serializeCheckout(req, merchant, last);
  }

  return {
    checkoutOf: checkout,

    /** The safe fields a payer needs, plus live status. `opened` marks a real page view. */
    async get(reference: string, opened: boolean): Promise<Checkout> {
      const req = await load(reference);
      if (opened && req.status !== "PAID") {
        const recent = await prisma.requestEvent.findFirst({
          where: { requestId: req.id, type: "CHECKOUT_OPENED", createdAt: { gt: new Date(Date.now() - OPENED_EVERY_MS) } },
          select: { id: true },
        });
        if (!recent) await prisma.$transaction((tx) => addEvent(tx, req.id, "CHECKOUT_OPENED"));
      }
      return checkout(req);
    },

    /** Called by the checkout right after the wallet submits: runs the matcher on the hash. */
    async verify(reference: string, txHash: string): Promise<Checkout> {
      const req = await load(reference);
      await verifyTransaction(deps, req, txHash);
      return checkout(await load(reference));
    },
  };
}

export type PublicService = ReturnType<typeof createPublicService>;
