import type { ResultCodes } from "@moyapay/shared";
import type { AssetRef } from "../lib/asset";

export type MemoType = "none" | "text" | "id" | "hash" | "return";

/** One payment operation into a watched address, as the matcher sees it. */
export interface IncomingOp {
  txHash: string;
  /** Horizon operation id. (txHash, opId) is the duplicate guard. */
  opId: string;
  pagingToken: string;
  opType: "payment" | "path_payment_strict_receive" | "path_payment_strict_send";
  ledger: number;
  /** Ledger close time. Expiry is judged by this, never by the server clock. */
  ledgerClosedAt: Date;
  from: string;
  to: string;
  asset: AssetRef;
  /** Amount received, 7 decimals. For path payments this is the destination amount. */
  amount: string;
  amountStroops: bigint;
  memo: string | null;
  memoType: MemoType;
  txSuccessful: boolean;
  resultCodes: ResultCodes | null;
}

export type PaymentSource = "watcher" | "verify";
