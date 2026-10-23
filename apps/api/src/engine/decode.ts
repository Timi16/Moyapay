import { formatStroops, parseAmount } from "../lib/amount";
import { ledgerOfPagingToken, type HorizonPaymentRecord, type HorizonTx } from "../lib/stellar/horizon";
import { decodeResultCodes } from "../lib/stellar/resultCodes";
import type { IncomingOp, MemoType } from "./types";

const PAYMENT_TYPES = new Set(["payment", "path_payment_strict_receive", "path_payment_strict_send"]);

export type SkipReason = "not_a_payment" | "not_incoming" | "outgoing" | "no_transaction";

const MEMO_TYPES: Record<string, MemoType> = { text: "text", id: "id", hash: "hash", return: "return" };

/**
 * Horizon payment record (with its transaction joined) -> IncomingOp for `destination`, or a
 * reason to skip it. Handles payment, path_payment_strict_receive and path_payment_strict_send
 * where `to == destination`; ignores every other operation type and anything the destination
 * sent itself.
 */
export function decodePaymentRecord(
  record: HorizonPaymentRecord,
  destination: string,
  tx: HorizonTx | undefined = record.transaction,
): IncomingOp | { skip: SkipReason } {
  if (!PAYMENT_TYPES.has(record.type)) return { skip: "not_a_payment" };
  const from = record.from ?? record.source_account;
  if (from === destination) return { skip: "outgoing" };
  if (record.to !== destination || !from) return { skip: "not_incoming" };
  if (!tx) return { skip: "no_transaction" };

  const txSuccessful = record.transaction_successful ?? tx.successful;
  // A failed path payment may report no amount; it settles nothing either way.
  const stroops = parseAmount(record.amount ?? "0") ?? 0n;
  const memoType = MEMO_TYPES[tx.memo_type ?? "none"] ?? "none";
  const ledger = tx.ledger || ledgerOfPagingToken(record.paging_token) || 0;

  return {
    txHash: record.transaction_hash,
    opId: record.id,
    pagingToken: record.paging_token,
    opType: record.type as IncomingOp["opType"],
    ledger,
    ledgerClosedAt: new Date(record.created_at),
    from,
    to: destination,
    asset:
      record.asset_type === "native"
        ? { code: "XLM", issuer: null }
        : { code: record.asset_code ?? "?", issuer: record.asset_issuer ?? null },
    amount: formatStroops(stroops),
    amountStroops: stroops,
    // Postgres text cannot hold NUL, and memo bytes come from the chain.
    memo: memoType === "none" ? null : (tx.memo ?? "").replace(/\u0000/g, "").slice(0, 128),
    memoType,
    txSuccessful,
    resultCodes: txSuccessful ? null : decodeResultCodes(tx.result_xdr),
  };
}

export function isSkip(value: IncomingOp | { skip: SkipReason }): value is { skip: SkipReason } {
  return "skip" in value;
}
