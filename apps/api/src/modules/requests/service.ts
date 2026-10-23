import type { Prisma, PaymentRequest } from "@prisma/client";
import {
  DEFAULT_EXPIRES_IN,
  REQUEST_STATUSES,
  type CreatePaymentRequestInput,
  type PaymentRequestDetail,
  type RequestStatus,
} from "@moyapay/shared";
import { uniqueViolation } from "../../db/prisma";
import type { AppDeps } from "../../deps";
import { verifyTransaction } from "../../engine/verify";
import { formatStroops, parseAmount } from "../../lib/amount";
import { usdc } from "../../lib/asset";
import { toCsv } from "../../lib/csv";
import { decodeCursor, encodeCursor } from "../../lib/cursor";
import { AppError, notFound } from "../../lib/errors";
import { generateReference } from "../../lib/ids";
import { assertCanReceiveUsdc, assertValidAddress, claimDestination } from "../destinations";
import { addEvent, announce } from "../transitions";
import { serializeEvent, serializePayment, serializeRequest, verificationChecks } from "./serialize";

const CSV_LIMIT = 10_000;

export interface ListRequestsInput {
  status?: RequestStatus;
  q?: string;
  limit: number;
  cursor?: string;
}

/** Search by reference (or part of one) or by transaction hash (or its start). */
function searchWhere(q: string | undefined): Prisma.PaymentRequestWhereInput {
  if (!q) return {};
  const ref = q.toUpperCase();
  const hash = q.toLowerCase();
  const or: Prisma.PaymentRequestWhereInput[] = [{ reference: { contains: ref } }];
  if (/^[0-9a-f]{4,64}$/.test(hash)) {
    or.push({ paidTxHash: { startsWith: hash } }, { payments: { some: { txHash: { startsWith: hash } } } });
  }
  return { OR: or };
}

export function createRequestService(deps: AppDeps) {
  const { prisma, horizon } = deps;

  async function detail(req: PaymentRequest): Promise<PaymentRequestDetail> {
    const [events, payments] = await Promise.all([
      prisma.requestEvent.findMany({ where: { requestId: req.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
      prisma.incomingPayment.findMany({ where: { requestId: req.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    ]);
    // The checks are shown for the payment that settled the request, or else the latest try.
    const shown = payments.find((p) => p.txHash === req.paidTxHash && p.result === "MATCHED") ?? payments[0] ?? null;
    return {
      ...serializeRequest(req),
      events: events.map(serializeEvent),
      payments: payments.map((p) => serializePayment({ ...p, request: { reference: req.reference } })),
      verification: shown ? { paymentId: shown.id, checks: verificationChecks(req, shown) } : null,
    };
  }

  async function findOwn(merchantId: string, reference: string): Promise<PaymentRequest> {
    const req = await prisma.paymentRequest.findUnique({ where: { reference } });
    if (!req || req.merchantId !== merchantId) throw notFound("Payment request");
    return req;
  }

  return {
    detail,
    findOwn,

    async create(merchantId: string, input: CreatePaymentRequestInput, via: "dashboard" | "api"): Promise<PaymentRequest> {
      const merchant = await prisma.merchant.findUniqueOrThrow({ where: { id: merchantId } });
      const destination = input.destination ?? merchant.walletAddress;
      assertValidAddress(destination);
      await assertCanReceiveUsdc(horizon, destination);
      await claimDestination(prisma, horizon, merchantId, destination);

      const stroops = parseAmount(input.amount);
      if (stroops === null || stroops <= 0n) throw new AppError("VALIDATION_FAILED", "Invalid amount");
      const expiresIn = input.expiresIn === undefined ? DEFAULT_EXPIRES_IN : input.expiresIn;
      const expiresAt = expiresIn === null ? null : new Date(Date.now() + expiresIn * 1000);
      const asset = usdc();

      // 729 million references; a collision is rare, and the unique index catches it.
      for (let attempt = 0; attempt < 8; attempt++) {
        const reference = generateReference();
        try {
          return await prisma.$transaction(async (tx) => {
            const req = await tx.paymentRequest.create({
              data: {
                merchantId,
                reference,
                destination,
                assetCode: asset.code,
                assetIssuer: asset.issuer,
                amount: formatStroops(stroops),
                amountStroops: stroops,
                description: input.description || null,
                expiresAt,
                createdVia: via,
              },
            });
            await addEvent(tx, req.id, "CREATED", {
              amount: req.amount,
              asset: asset.code,
              destination,
              expiresAt: expiresAt?.toISOString() ?? null,
              via,
            });
            await announce(tx, req);
            return req;
          });
        } catch (err) {
          if (uniqueViolation(err)?.includes("reference")) continue;
          throw err;
        }
      }
      throw new AppError("INTERNAL", "Could not allocate a unique reference");
    },

    async list(merchantId: string, input: ListRequestsInput) {
      const where: Prisma.PaymentRequestWhereInput = {
        merchantId,
        ...(input.status ? { status: input.status } : {}),
        ...searchWhere(input.q),
      };
      const after = input.cursor ? decodeCursor(input.cursor) : null;
      const rows = await prisma.paymentRequest.findMany({
        where: after
          ? {
              AND: [
                where,
                { OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] },
              ],
            }
          : where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
      });
      const page = rows.slice(0, input.limit);
      const last = page[page.length - 1];
      const grouped = await prisma.paymentRequest.groupBy({
        by: ["status"],
        where: { merchantId, ...searchWhere(input.q) },
        _count: { _all: true },
      });
      const counts = Object.fromEntries(REQUEST_STATUSES.map((s) => [s, 0])) as Record<RequestStatus, number>;
      for (const g of grouped) counts[g.status] = g._count._all;
      return {
        data: page.map(serializeRequest),
        nextCursor: rows.length > input.limit && last ? encodeCursor(last.createdAt, last.id) : null,
        counts: { ALL: Object.values(counts).reduce((a, b) => a + b, 0), ...counts },
      };
    },

    async csv(merchantId: string, input: Pick<ListRequestsInput, "status" | "q">): Promise<string> {
      const rows = await prisma.paymentRequest.findMany({
        where: { merchantId, ...(input.status ? { status: input.status } : {}), ...searchWhere(input.q) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: CSV_LIMIT,
      });
      return toCsv(
        ["reference", "description", "amount", "asset", "status", "destination", "created_at", "expires_at", "paid_at", "paid_tx_hash", "failed_reason"],
        rows.map((r) => [
          r.reference,
          r.description,
          r.amount,
          r.assetCode,
          r.status,
          r.destination,
          r.createdAt.toISOString(),
          r.expiresAt?.toISOString() ?? "",
          r.paidAt?.toISOString() ?? "",
          r.paidTxHash ?? "",
          r.failedReason ?? "",
        ]),
      );
    },

    async get(merchantId: string, reference: string): Promise<PaymentRequestDetail> {
      return detail(await findOwn(merchantId, reference));
    },

    /** Verify now: looks the hash up on Horizon and runs the matcher on it. */
    async verify(merchantId: string, reference: string, txHash: string) {
      const req = await findOwn(merchantId, reference);
      const results = await verifyTransaction(deps, req, txHash);
      const fresh = await prisma.paymentRequest.findUniqueOrThrow({ where: { id: req.id } });
      return {
        request: await detail(fresh),
        payments: results.map((r) => ({
          ...serializePayment({ ...r.payment, request: r.payment.requestId === fresh.id ? { reference: fresh.reference } : null }),
          alreadyRecorded: !r.inserted,
        })),
      };
    },
  };
}

export type RequestService = ReturnType<typeof createRequestService>;
