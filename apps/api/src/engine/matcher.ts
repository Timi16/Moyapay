import type { IncomingPayment, PaymentRequest, PaymentResult } from "@prisma/client";
import { normalizeReference } from "@moyapay/shared";
import { CHANNELS, notify } from "../db/notify";
import type { Tx } from "../db/prisma";
import { formatStroops } from "../lib/amount";
import { describeAsset, sameAsset } from "../lib/asset";
import { describeResultCodes } from "../lib/stellar/resultCodes";
import { serializePayment, serializeRequest } from "../modules/requests/serialize";
import { addEvent, lockRequestByReference, markFailed, markPaid } from "../modules/transitions";
import { enqueueWebhook } from "../modules/webhooks/outbox";
import type { IncomingOp, PaymentSource } from "./types";

export type RequestFacts = Pick<
  PaymentRequest,
  | "id"
  | "reference"
  | "merchantId"
  | "destination"
  | "assetCode"
  | "assetIssuer"
  | "amount"
  | "amountStroops"
  | "status"
  | "expiresAt"
  | "paidTxHash"
>;

export interface Decision {
  result: PaymentResult;
  reason: string;
  /** What happens to the request. */
  effect: "NONE" | "PAID" | "FAILED";
  /** True when the payment belongs to the request (shown on it, linked by requestId). */
  linked: boolean;
}

/** The reference a payment carries, or why it carries none. */
export function referenceOf(op: Pick<IncomingOp, "memo" | "memoType">): { reference: string | null; problem: string } {
  if (op.memoType === "none" || op.memo === null || op.memo.trim() === "") {
    return { reference: null, problem: "No memo on the transaction" };
  }
  if (op.memoType !== "text") {
    return { reference: null, problem: `The memo is a ${op.memoType} memo, not a text reference` };
  }
  const reference = normalizeReference(op.memo);
  return reference
    ? { reference, problem: "" }
    : { reference: null, problem: `Memo "${op.memo}" is not a MoyaPay reference` };
}

const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;
/** "2026-10-23 09:42:32 UTC": readable in a reason, unambiguous across time zones. */
const utc = (d: Date) => `${d.toISOString().slice(0, 19).replace("T", " ")} UTC`;

/**
 * The build plan's decision table (Step 5), checked in order:
 *   1 transaction failed                        FAILED_TX     PENDING -> FAILED
 *   2 no memo / not this merchant's reference   UNMATCHED
 *   3 request is PAID                           ALREADY_PAID
 *   4 request EXPIRED, or ledger time > expiry  LATE
 *   5 asset differs (code + issuer)             WRONG_ASSET   request unchanged
 *   6 amount differs (stroops)                  WRONG_AMOUNT  request unchanged
 *   7 otherwise                                 MATCHED       -> PAID
 * Pure: `req` is the request the memo names (already looked up), or null.
 */
export function decide(op: IncomingOp, req: RequestFacts | null, merchantId: string): Decision {
  const ref = referenceOf(op);
  // The request counts only if it is this merchant's and asks to be paid at this address.
  const linked = req !== null && req.merchantId === merchantId && req.destination === op.to;

  // 1. Failed on-chain. Nothing moved; the payer can try again.
  if (!op.txSuccessful) {
    const codes = describeResultCodes(op.resultCodes);
    const inTime = !req?.expiresAt || op.ledgerClosedAt.getTime() <= req.expiresAt.getTime();
    const canFail = linked && (req.status === "PENDING" || req.status === "FAILED") && inTime;
    return {
      result: "FAILED_TX",
      reason: `Transaction failed on Stellar (${codes})`,
      effect: canFail ? "FAILED" : "NONE",
      linked,
    };
  }

  // 2. No usable reference for this merchant at this address.
  if (!req || req.merchantId !== merchantId) {
    const reason = ref.reference ? `${ref.reference} is not one of this merchant's payment requests` : ref.problem;
    return { result: "UNMATCHED", reason, effect: "NONE", linked: false };
  }
  if (req.destination !== op.to) {
    return {
      result: "UNMATCHED",
      reason: `${req.reference} asks to be paid to ${short(req.destination)}, not to ${short(op.to)}`,
      effect: "NONE",
      linked: false,
    };
  }

  // 3. Already settled by another payment.
  if (req.status === "PAID") {
    const by = req.paidTxHash ? ` by transaction ${req.paidTxHash.slice(0, 8)}…` : "";
    return { result: "ALREADY_PAID", reason: `${req.reference} was already paid${by}`, effect: "NONE", linked };
  }

  // 4. Too late. Ledger close time decides, not the server clock.
  if (req.status === "EXPIRED" || (req.expiresAt && op.ledgerClosedAt.getTime() > req.expiresAt.getTime())) {
    const when = req.expiresAt ? ` at ${utc(req.expiresAt)}` : "";
    return {
      result: "LATE",
      reason: `Arrived ${utc(op.ledgerClosedAt)}, after ${req.reference} expired${when}`,
      effect: "NONE",
      linked,
    };
  }

  // 5. Wrong asset, including a look-alike "USDC" from another issuer.
  const wanted = { code: req.assetCode, issuer: req.assetIssuer };
  if (!sameAsset(op.asset, wanted)) {
    return {
      result: "WRONG_ASSET",
      reason: `Sent ${describeAsset(op.asset)}; the request asks for ${describeAsset(wanted)}`,
      effect: "NONE",
      linked,
    };
  }

  // 6. Wrong amount, compared as integer stroops.
  if (op.amountStroops !== req.amountStroops) {
    const under = op.amountStroops < req.amountStroops;
    const diff = under ? req.amountStroops - op.amountStroops : op.amountStroops - req.amountStroops;
    return {
      result: "WRONG_AMOUNT",
      reason: `${under ? "Underpaid" : "Overpaid"} by ${formatStroops(diff)} ${req.assetCode}: sent ${op.amount}, expected ${req.amount}`,
      effect: "NONE",
      linked,
    };
  }

  // 7. Every check passed.
  return {
    result: "MATCHED",
    reason: "Recipient, asset, amount, reference and transaction all check out",
    effect: "PAID",
    linked,
  };
}

export interface ProcessResult {
  /** false when this (txHash, opId) was already recorded. */
  inserted: boolean;
  payment: IncomingPayment;
  result: PaymentResult;
}

/**
 * Records one payment operation and applies its result. Must run inside the caller's
 * transaction so the payment row, the request change, the events, the webhook rows and (for
 * the watcher) the cursor commit together.
 */
export async function processOperation(
  tx: Tx,
  op: IncomingOp,
  merchantId: string,
  source: PaymentSource,
): Promise<ProcessResult> {
  // Duplicate guard: INSERT … ON CONFLICT (txHash, opId) DO NOTHING. A concurrent insert of the
  // same pair waits on the unique index until the other transaction commits, then conflicts.
  const inserted = await tx.incomingPayment.createMany({
    data: [
      {
        merchantId,
        txHash: op.txHash,
        opId: op.opId,
        pagingToken: op.pagingToken,
        ledger: op.ledger,
        createdAtLedger: op.ledgerClosedAt,
        fromAddress: op.from,
        toAddress: op.to,
        assetCode: op.asset.code,
        assetIssuer: op.asset.issuer,
        amount: op.amount,
        amountStroops: op.amountStroops,
        opType: op.opType,
        memo: op.memo,
        memoType: op.memoType,
        txSuccessful: op.txSuccessful,
        resultCodes: op.resultCodes ? { ...op.resultCodes } : undefined,
        result: "UNMATCHED", // provisional; replaced below in this transaction
        reason: "",
        source,
      },
    ],
    skipDuplicates: true,
  });
  if (inserted.count === 0) {
    const existing = await tx.incomingPayment.findUniqueOrThrow({
      where: { txHash_opId: { txHash: op.txHash, opId: op.opId } },
    });
    if (existing.requestId) {
      await addEvent(tx, existing.requestId, "DUPLICATE_IGNORED", {
        txHash: op.txHash,
        opId: op.opId,
        source,
        result: existing.result,
      });
    }
    return { inserted: false, payment: existing, result: existing.result };
  }
  const row = await tx.incomingPayment.findUniqueOrThrow({
    where: { txHash_opId: { txHash: op.txHash, opId: op.opId } },
  });

  const { reference } = referenceOf(op);
  // Row lock: every payment for one request is decided one at a time.
  const req = reference ? await lockRequestByReference(tx, reference) : null;
  let decision = decide(op, req, merchantId);
  const seen = {
    paymentId: row.id,
    txHash: op.txHash,
    opId: op.opId,
    amount: op.amount,
    asset: op.asset.code,
    from: op.from,
    source,
  };

  let statusChanged: "PAID" | "FAILED" | null = null;
  if (decision.linked && req) {
    await addEvent(tx, req.id, "PAYMENT_SEEN", seen);
    if (decision.effect === "PAID") {
      const paid = await markPaid(tx, req.id, {
        txHash: op.txHash,
        paidAt: op.ledgerClosedAt,
        paymentId: row.id,
        opId: op.opId,
      });
      if (paid) statusChanged = "PAID";
      else {
        // Lost the race to another payment: the conditional update changed no row.
        decision = { ...decision, result: "ALREADY_PAID", reason: `${req.reference} was already paid`, effect: "NONE" };
      }
    } else if (decision.effect === "FAILED") {
      const failed = await markFailed(tx, req.id, decision.reason, { txHash: op.txHash, resultCodes: op.resultCodes });
      if (failed) statusChanged = "FAILED";
    }
    if (!statusChanged) {
      await addEvent(tx, req.id, "FLAGGED", { ...seen, result: decision.result, reason: decision.reason });
    }
  }

  const payment = await tx.incomingPayment.update({
    where: { id: row.id },
    data: { result: decision.result, reason: decision.reason, requestId: decision.linked && req ? req.id : null },
  });
  await notify(tx, CHANNELS.paymentRecorded, { id: payment.id, merchantId });

  // Status webhooks (outbox rows; the worker sends them after this transaction commits).
  if (statusChanged && req) {
    const fresh = await tx.paymentRequest.findUniqueOrThrow({ where: { id: req.id } });
    await enqueueWebhook(tx, merchantId, statusChanged === "PAID" ? "request.paid" : "request.failed", {
      request: serializeRequest(fresh),
      payment: serializePayment({ ...payment, request: { reference: fresh.reference } }),
    });
  } else if (decision.result === "UNMATCHED") {
    await enqueueWebhook(tx, merchantId, "payment.unmatched", {
      payment: serializePayment({ ...payment, request: null }),
    });
  }

  return { inserted: true, payment, result: decision.result };
}
