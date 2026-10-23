import { Router } from "express";
import { z } from "zod";
import {
  AccountParamsSchema,
  NEEDS_REVIEW_RESULTS,
  OPEN_STATUSES,
  type AccountCheck,
  type ActivityItem,
  type Summary,
} from "@moyapay/shared";
import type { AppDeps } from "../../deps";
import { watcherStatus } from "../../engine/status";
import { formatStroops } from "../../lib/amount";
import { usdc } from "../../lib/asset";
import { assertValidAddress } from "../destinations";
import { authOf } from "../../middleware/auth";
import { parse } from "../../middleware/validate";

const DAY_MS = 86_400_000;
const ActivityQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }).strict();

const EVENT_TEXT: Record<string, string> = {
  CREATED: "Request created",
  CHECKOUT_OPENED: "Checkout opened",
  PAYMENT_SEEN: "Payment seen",
  PAID: "Paid",
  FAILED: "Payment failed on Stellar",
  EXPIRED: "Request expired",
  FLAGGED: "Payment flagged",
};

/** Overview data: stat cards, activity feed, and the destination trustline check. */
export function dashboardRoutes(deps: AppDeps): Router {
  const router = Router();
  const { prisma, horizon } = deps;

  router.get("/summary", async (req, res) => {
    const { merchantId } = authOf(req);
    const now = Date.now();
    const since = new Date(now - 30 * DAY_MS);
    const [paid, open, review, watcher] = await Promise.all([
      prisma.paymentRequest.findMany({
        where: { merchantId, status: "PAID", paidAt: { gte: since } },
        select: { paidAt: true, amountStroops: true },
      }),
      prisma.paymentRequest.aggregate({
        where: { merchantId, status: { in: [...OPEN_STATUSES] } },
        _count: { _all: true },
        _sum: { amountStroops: true },
      }),
      prisma.incomingPayment.groupBy({
        by: ["result"],
        where: { merchantId, result: { in: [...NEEDS_REVIEW_RESULTS] }, resolution: "NONE" },
        _count: { _all: true },
      }),
      watcherStatus(prisma),
    ]);
    const needsReview = review.reduce((n, g) => n + g._count._all, 0);
    // 30 daily buckets (UTC), oldest first, for the mini bar chart.
    const days = new Map<string, bigint>();
    for (let i = 29; i >= 0; i--) days.set(new Date(now - i * DAY_MS).toISOString().slice(0, 10), 0n);
    let total = 0n;
    for (const r of paid) {
      total += r.amountStroops;
      const day = r.paidAt?.toISOString().slice(0, 10);
      if (day && days.has(day)) days.set(day, (days.get(day) ?? 0n) + r.amountStroops);
    }
    const body: Summary = {
      collected30d: {
        amount: formatStroops(total),
        daily: [...days].map(([date, amount]) => ({ date, amount: formatStroops(amount) })),
      },
      paid30d: paid.length,
      pending: open._count._all,
      pendingAmount: formatStroops(open._sum.amountStroops ?? 0n),
      needsReview,
      needsReviewKinds: review.sort((a, b) => b._count._all - a._count._all).map((g) => g.result),
      watcher,
    };
    res.json(body);
  });

  /** Live activity feed: request events and payments that belong to no request, newest first. */
  router.get("/activity", async (req, res) => {
    const { merchantId } = authOf(req);
    const { limit } = parse(ActivityQuery, req.query);
    const [events, orphans] = await Promise.all([
      prisma.requestEvent.findMany({
        where: { request: { merchantId }, type: { notIn: ["DUPLICATE_IGNORED", "PAYMENT_SEEN"] } },
        include: { request: { select: { reference: true, amount: true, paidTxHash: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
      }),
      prisma.incomingPayment.findMany({
        where: { merchantId, requestId: null },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
      }),
    ]);
    const items: ActivityItem[] = [
      ...events.map((e): ActivityItem => {
        const data = (e.data ?? {}) as { txHash?: unknown; reason?: unknown; amount?: unknown };
        const reason = typeof data.reason === "string" ? data.reason : null;
        return {
          id: e.id,
          kind: "request",
          type: e.type,
          reference: e.request.reference,
          amount: typeof data.amount === "string" ? data.amount : e.request.amount,
          txHash: typeof data.txHash === "string" ? data.txHash : null,
          message: reason && (e.type === "FLAGGED" || e.type === "FAILED") ? reason : (EVENT_TEXT[e.type] ?? e.type),
          at: e.createdAt.toISOString(),
        };
      }),
      ...orphans.map(
        (p): ActivityItem => ({
          id: p.id,
          kind: "payment",
          type: p.result,
          reference: null,
          amount: p.amount,
          txHash: p.txHash,
          message: p.reason,
          at: p.createdAt.toISOString(),
        }),
      ),
    ];
    items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    res.json({ data: items.slice(0, limit) });
  });

  /** For the new-request form: can this address receive USDC? */
  router.get("/accounts/:address", async (req, res) => {
    const { address } = parse(AccountParamsSchema, req.params);
    assertValidAddress(address, "address");
    const account = await horizon.account(address);
    const asset = usdc();
    const line = account.exists
      ? account.trustlines.find((t) => t.code === asset.code && t.issuer === asset.issuer && t.authorized)
      : undefined;
    const body: AccountCheck = {
      address,
      exists: account.exists,
      usdcTrustline: line !== undefined,
      usdcBalance: line?.balance ?? null,
    };
    res.json(body);
  });

  return router;
}
