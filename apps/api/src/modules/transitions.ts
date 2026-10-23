import { Prisma, type EventType, type PaymentRequest } from "@prisma/client";
import { CHANNELS, notify } from "../db/notify";
import type { Tx } from "../db/prisma";

// The ONLY file allowed to change PaymentRequest.status (enforced by an ESLint rule).
//
//   PENDING ──match──▶ PAID                                   (final)
//   PENDING ──payer tx fails on-chain──▶ FAILED ──valid match──▶ PAID
//   PENDING / FAILED ──expiresAt passes──▶ EXPIRED            (final)
//
// Every change is a conditional UPDATE on the expected statuses, so a stale caller changes
// nothing instead of overwriting a newer status. Callers hold the row lock (lockRequest*).

const OPEN = ["PENDING", "FAILED"] as const;

export async function addEvent(
  tx: Tx,
  requestId: string,
  type: EventType,
  data: Record<string, unknown> = {},
): Promise<void> {
  // Stamped here, not by the database: Postgres now() is the transaction's start time, so
  // several events written in one transaction would all share it. Timelines sort by
  // (createdAt, id), and cuid ids increase within a process.
  await tx.requestEvent.create({
    data: { requestId, type, data: JSON.parse(JSON.stringify(data)) as Prisma.InputJsonObject, createdAt: new Date() },
  });
}

/** Transactional NOTIFY: subscribers hear about it only once the transaction commits. */
export async function announce(tx: Tx, req: Pick<PaymentRequest, "id" | "reference" | "merchantId">): Promise<void> {
  await notify(tx, CHANNELS.requestUpdated, { id: req.id, reference: req.reference, merchantId: req.merchantId });
}

/** SELECT … FOR UPDATE on one request; returns the fresh row or null. */
export async function lockRequestById(tx: Tx, id: string): Promise<PaymentRequest | null> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "PaymentRequest" WHERE "id" = ${id} FOR UPDATE`;
  if (rows.length === 0) return null;
  return tx.paymentRequest.findUnique({ where: { id } });
}

export async function lockRequestByReference(tx: Tx, reference: string): Promise<PaymentRequest | null> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "PaymentRequest" WHERE "reference" = ${reference} FOR UPDATE`;
  const id = rows[0]?.id;
  return id ? tx.paymentRequest.findUnique({ where: { id } }) : null;
}

/**
 * PENDING/FAILED -> PAID. The WHERE clause is the race guard from the plan:
 *   UPDATE … SET status='PAID' WHERE id=$id AND status IN ('PENDING','FAILED') AND paidTxHash IS NULL
 * Returns null when no row changed (someone else got there first): the caller records
 * ALREADY_PAID instead.
 */
export async function markPaid(
  tx: Tx,
  id: string,
  payment: { txHash: string; paidAt: Date; paymentId: string; opId: string },
): Promise<PaymentRequest | null> {
  // paidTxHash is unique. Checked first: a unique violation would abort the whole transaction
  // (and with it the watcher's cursor update), when this is just "already used".
  const taken = await tx.paymentRequest.findUnique({ where: { paidTxHash: payment.txHash }, select: { id: true } });
  if (taken && taken.id !== id) return null;
  const updated = await tx.paymentRequest.updateMany({
    where: { id, status: { in: [...OPEN] }, paidTxHash: null },
    data: { status: "PAID", paidTxHash: payment.txHash, paidAt: payment.paidAt, failedReason: null },
  });
  if (updated.count === 0) return null;
  await addEvent(tx, id, "PAID", { txHash: payment.txHash, opId: payment.opId, paymentId: payment.paymentId });
  const req = await tx.paymentRequest.findUniqueOrThrow({ where: { id } });
  await announce(tx, req);
  return req;
}

/**
 * PENDING -> FAILED (or a further failure on a FAILED request, which only updates the
 * reason). The payer can still retry until the request expires.
 */
export async function markFailed(
  tx: Tx,
  id: string,
  reason: string,
  data: Record<string, unknown>,
): Promise<PaymentRequest | null> {
  const updated = await tx.paymentRequest.updateMany({
    where: { id, status: { in: [...OPEN] } },
    data: { status: "FAILED", failedReason: reason },
  });
  if (updated.count === 0) return null;
  await addEvent(tx, id, "FAILED", { reason, ...data });
  const req = await tx.paymentRequest.findUniqueOrThrow({ where: { id } });
  await announce(tx, req);
  return req;
}

/** PENDING/FAILED -> EXPIRED, only if expiresAt is before `cutoff`. */
export async function markExpired(tx: Tx, id: string, cutoff: Date): Promise<PaymentRequest | null> {
  const updated = await tx.paymentRequest.updateMany({
    where: { id, status: { in: [...OPEN] }, expiresAt: { lt: cutoff } },
    data: { status: "EXPIRED" },
  });
  if (updated.count === 0) return null;
  const req = await tx.paymentRequest.findUniqueOrThrow({ where: { id } });
  await addEvent(tx, id, "EXPIRED", { expiresAt: req.expiresAt?.toISOString() ?? null });
  await announce(tx, req);
  return req;
}
