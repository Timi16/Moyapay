import type { IncomingPayment, Prisma } from "@prisma/client";
import {
  NEEDS_REVIEW_RESULTS,
  type PatchTransactionInput,
  type PaymentResult,
  type TransactionView,
} from "@moyapay/shared";
import type { Tx } from "../../db/prisma";
import type { AppDeps } from "../../deps";
import { toCsv } from "../../lib/csv";
import { decodeCursor, encodeCursor } from "../../lib/cursor";
import { AppError, notFound } from "../../lib/errors";
import { serializePayment, serializeRequest, verificationChecks } from "../requests/serialize";
import { addEvent, lockRequestByReference, markPaid } from "../transitions";
import { enqueueWebhook } from "../webhooks/outbox";

const CSV_LIMIT = 10_000;

export interface ListTransactionsInput {
  result?: PaymentResult;
  view: TransactionView;
  q?: string;
  limit: number;
  cursor?: string;
}

export function viewWhere(view: TransactionView): Prisma.IncomingPaymentWhereInput {
  switch (view) {
    case "needs_review":
      return { result: { in: [...NEEDS_REVIEW_RESULTS] }, resolution: "NONE" };
    case "matched":
      return { OR: [{ result: "MATCHED" }, { resolution: "ASSIGNED" }] };
    case "ignored":
      return { resolution: "IGNORED" };
    case "refunded":
      return { resolution: "REFUNDED" };
    case "all":
      return {};
  }
}

function searchWhere(q: string | undefined): Prisma.IncomingPaymentWhereInput {
  if (!q) return {};
  const or: Prisma.IncomingPaymentWhereInput[] = [
    { memo: { contains: q, mode: "insensitive" } },
    { request: { reference: { contains: q.toUpperCase() } } },
  ];
  if (/^[0-9a-fA-F]{4,64}$/.test(q)) or.push({ txHash: { startsWith: q.toLowerCase() } });
  if (/^G[A-Z2-7]{3,55}$/.test(q)) or.push({ fromAddress: { startsWith: q } });
  return { OR: or };
}

const withRequest = { request: { select: { reference: true } } } as const;

async function lockPayment(tx: Tx, merchantId: string, id: string): Promise<IncomingPayment> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "IncomingPayment" WHERE "id" = ${id} AND "merchantId" = ${merchantId} FOR UPDATE`;
  if (rows.length === 0) throw notFound("Transaction");
  return tx.incomingPayment.findUniqueOrThrow({ where: { id } });
}

const notAssignable = (message: string) => new AppError("PAYMENT_NOT_ASSIGNABLE", message);

export function createTransactionService(deps: AppDeps) {
  const { prisma } = deps;

  async function counts(merchantId: string) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const [all, needsReview, matched, ignored, refunded, byResult, seenToday, duplicatesIgnored] = await Promise.all([
      prisma.incomingPayment.count({ where: { merchantId } }),
      prisma.incomingPayment.count({ where: { merchantId, ...viewWhere("needs_review") } }),
      prisma.incomingPayment.count({ where: { merchantId, ...viewWhere("matched") } }),
      prisma.incomingPayment.count({ where: { merchantId, ...viewWhere("ignored") } }),
      prisma.incomingPayment.count({ where: { merchantId, ...viewWhere("refunded") } }),
      prisma.incomingPayment.groupBy({ by: ["result"], where: { merchantId }, _count: { _all: true } }),
      prisma.incomingPayment.count({ where: { merchantId, createdAt: { gte: today } } }),
      // The same operation seen again (replay, verify after the watcher): logged, never stored twice.
      prisma.requestEvent.count({ where: { type: "DUPLICATE_IGNORED", request: { merchantId } } }),
    ]);
    return {
      all,
      needsReview,
      matched,
      ignored,
      refunded,
      seenToday,
      duplicatesIgnored,
      byResult: Object.fromEntries(byResult.map((g) => [g.result, g._count._all])) as Partial<Record<PaymentResult, number>>,
    };
  }

  return {
    counts,

    async list(merchantId: string, input: ListTransactionsInput) {
      const where: Prisma.IncomingPaymentWhereInput = {
        AND: [{ merchantId }, viewWhere(input.view), input.result ? { result: input.result } : {}, searchWhere(input.q)],
      };
      const after = input.cursor ? decodeCursor(input.cursor) : null;
      const rows = await prisma.incomingPayment.findMany({
        where: after
          ? {
              AND: [
                where,
                { OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] },
              ],
            }
          : where,
        include: withRequest,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
      });
      const page = rows.slice(0, input.limit);
      const last = page[page.length - 1];
      return {
        data: page.map(serializePayment),
        nextCursor: rows.length > input.limit && last ? encodeCursor(last.createdAt, last.id) : null,
        counts: await counts(merchantId),
      };
    },

    async csv(merchantId: string, input: Pick<ListTransactionsInput, "result" | "view" | "q">): Promise<string> {
      const rows = await prisma.incomingPayment.findMany({
        where: { AND: [{ merchantId }, viewWhere(input.view), input.result ? { result: input.result } : {}, searchWhere(input.q)] },
        include: withRequest,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: CSV_LIMIT,
      });
      return toCsv(
        ["recorded_at", "ledger_closed_at", "tx_hash", "op_id", "ledger", "from", "to", "asset_code", "asset_issuer", "amount", "memo", "tx_successful", "result", "reason", "request_reference", "resolution", "resolution_note"],
        rows.map((p) => [
          p.createdAt.toISOString(),
          p.createdAtLedger.toISOString(),
          p.txHash,
          p.opId,
          p.ledger,
          p.fromAddress,
          p.toAddress,
          p.assetCode,
          p.assetIssuer ?? "native",
          p.amount,
          p.memo ?? "",
          p.txSuccessful,
          p.result,
          p.reason,
          p.request?.reference ?? "",
          p.resolution,
          p.resolutionNote ?? "",
        ]),
      );
    },

    async get(merchantId: string, id: string) {
      const p = await prisma.incomingPayment.findFirst({ where: { id, merchantId }, include: { request: true } });
      if (!p) throw notFound("Transaction");
      return {
        ...serializePayment(p),
        request: p.request ? serializeRequest(p.request) : null,
        checks: p.request ? verificationChecks(p.request, p) : null,
      };
    },

    async patch(merchantId: string, id: string, input: PatchTransactionInput) {
      await prisma.$transaction(async (tx) => {
        const p = await lockPayment(tx, merchantId, id);
        if (input.resolution === "ASSIGNED") {
          await assign(tx, merchantId, p, input.requestRef, input.note);
          return;
        }
        if (p.result === "MATCHED" || p.resolution === "ASSIGNED") {
          throw notAssignable("This payment settled a request; it can't be marked refunded or ignored");
        }
        if (input.resolution === "NONE") {
          await tx.incomingPayment.update({ where: { id }, data: { resolution: "NONE", resolutionNote: null, resolvedAt: null } });
          return;
        }
        await tx.incomingPayment.update({
          where: { id },
          data: { resolution: input.resolution, resolutionNote: input.note ?? null, resolvedAt: new Date() },
        });
      });
      return this.get(merchantId, id);
    },
  };
}

/**
 * Assigns an unmatched payment (wrong or missing memo) to one of the merchant's open
 * requests. It must still pass every other check, and it settles the request through the
 * same conditional update as the watcher, so a request is never paid twice.
 */
async function assign(tx: Tx, merchantId: string, p: IncomingPayment, reference: string, note: string | undefined) {
  if (p.result !== "UNMATCHED" || p.resolution !== "NONE") {
    throw notAssignable("Only an unmatched, unresolved payment can be assigned to a request");
  }
  if (!p.txSuccessful) throw notAssignable("A failed transaction moved no money");
  const req = await lockRequestByReference(tx, reference);
  if (!req || req.merchantId !== merchantId) throw notFound("Payment request");
  if (req.status !== "PENDING" && req.status !== "FAILED") throw notAssignable(`${req.reference} is ${req.status.toLowerCase()}`);
  if (req.destination !== p.toAddress) throw notAssignable(`${req.reference} is paid to a different address`);
  if (req.assetCode !== p.assetCode || req.assetIssuer !== p.assetIssuer) throw notAssignable("The payment is in a different asset");
  if (req.amountStroops !== p.amountStroops) {
    throw notAssignable(`The payment is ${p.amount} but ${req.reference} asks for ${req.amount}`);
  }
  if (req.expiresAt && p.createdAtLedger.getTime() > req.expiresAt.getTime()) {
    throw notAssignable(`The payment arrived after ${req.reference} expired`);
  }
  if (await tx.paymentRequest.findUnique({ where: { paidTxHash: p.txHash }, select: { id: true } })) {
    throw notAssignable("This transaction already paid another request");
  }

  await addEvent(tx, req.id, "PAYMENT_SEEN", {
    paymentId: p.id,
    txHash: p.txHash,
    opId: p.opId,
    amount: p.amount,
    asset: p.assetCode,
    from: p.fromAddress,
    assignedManually: true,
  });
  const paid = await markPaid(tx, req.id, { txHash: p.txHash, paidAt: p.createdAtLedger, paymentId: p.id, opId: p.opId });
  if (!paid) throw notAssignable(`${req.reference} was paid in the meantime`);
  const payment = await tx.incomingPayment.update({
    where: { id: p.id },
    data: { requestId: req.id, resolution: "ASSIGNED", resolutionNote: note ?? null, resolvedAt: new Date() },
  });
  await enqueueWebhook(tx, merchantId, "request.paid", {
    request: serializeRequest(paid),
    payment: serializePayment({ ...payment, request: { reference: paid.reference } }),
  });
}

export type TransactionService = ReturnType<typeof createTransactionService>;
