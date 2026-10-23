import type { PaymentRequest, PrismaClient } from "@prisma/client";
import { Asset, FeeBumpTransaction, MuxedAccount, StrKey, TransactionBuilder, type OperationRecord } from "@stellar/stellar-sdk";
import { env } from "../config/env";
import { AppError } from "../lib/errors";
import { HorizonError, type Horizon, type HorizonPaymentRecord, type HorizonTx } from "../lib/stellar/horizon";
import { decodePaymentRecord, isSkip } from "./decode";
import { processOperation, type ProcessResult } from "./matcher";
import type { IncomingOp } from "./types";

const OP_TYPES: Record<string, HorizonPaymentRecord["type"]> = {
  payment: "payment",
  pathPaymentStrictReceive: "path_payment_strict_receive",
  pathPaymentStrictSend: "path_payment_strict_send",
};

function baseAccount(address: string): string {
  return StrKey.isValidMed25519PublicKey(address) ? MuxedAccount.fromAddress(address, "0").baseAccount().accountId() : address;
}

function assetFields(asset: Asset): Pick<HorizonPaymentRecord, "asset_type" | "asset_code" | "asset_issuer"> {
  return asset.isNative()
    ? { asset_type: "native" }
    : { asset_type: "credit_alphanum", asset_code: asset.getCode(), asset_issuer: asset.getIssuer() };
}

/**
 * Builds payment records from the transaction envelope. Used when Horizon lists no payment
 * operations for a transaction (it can leave out the operations of a failed one), so a failed
 * payment is still recorded as FAILED_TX with the same operation id the stream would use.
 */
export function recordsFromEnvelope(tx: HorizonTx): HorizonPaymentRecord[] {
  if (!tx.envelope_xdr || !tx.paging_token || !/^\d+$/.test(tx.paging_token)) return [];
  let parsed = TransactionBuilder.fromXDR(tx.envelope_xdr, env.NETWORK_PASSPHRASE);
  if (parsed instanceof FeeBumpTransaction) parsed = parsed.innerTransaction;
  const txToid = BigInt(tx.paging_token);
  const out: HorizonPaymentRecord[] = [];
  parsed.operations.forEach((op: OperationRecord, index) => {
    const type = OP_TYPES[op.type];
    if (!type) return;
    const id = (txToid + BigInt(index + 1)).toString();
    const base = {
      id,
      paging_token: id,
      type,
      created_at: tx.created_at,
      transaction_hash: tx.hash,
      transaction_successful: tx.successful,
      from: baseAccount(op.source ?? parsed.source),
      transaction: tx,
    };
    if (op.type === "payment") {
      out.push({ ...base, to: baseAccount(op.destination), amount: op.amount, ...assetFields(op.asset) });
    } else if (op.type === "pathPaymentStrictReceive") {
      out.push({ ...base, to: baseAccount(op.destination), amount: op.destAmount, ...assetFields(op.destAsset) });
    } else if (op.type === "pathPaymentStrictSend") {
      out.push({ ...base, to: baseAccount(op.destination), amount: op.destMin, ...assetFields(op.destAsset) });
    }
  });
  return out;
}

export interface VerifyDeps {
  prisma: PrismaClient;
  horizon: Horizon;
}

/**
 * Verify by hash: fetches the transaction from Horizon and runs every payment operation in it
 * that targets the request's address through the same matcher as the watcher. The (txHash,
 * opId) guard makes it safe to call any number of times, alongside the watcher.
 */
export async function verifyTransaction(
  deps: VerifyDeps,
  req: PaymentRequest,
  txHash: string,
): Promise<ProcessResult[]> {
  let tx: HorizonTx | null;
  let records: HorizonPaymentRecord[];
  try {
    tx = await deps.horizon.transaction(txHash);
    records = tx ? await deps.horizon.transactionPayments(txHash) : [];
  } catch (err) {
    if (err instanceof HorizonError) {
      throw new AppError("HORIZON_UNAVAILABLE", "Could not reach Stellar to look up this transaction", { retryAfter: 5 });
    }
    throw err;
  }
  if (!tx) {
    throw new AppError(
      "TX_NOT_FOUND",
      "Stellar Testnet has no transaction with this hash. If it was just submitted, try again in a few seconds.",
    );
  }
  if (records.length === 0) records = recordsFromEnvelope(tx);

  // The address is watched for one merchant; payments to it are that merchant's records. Like
  // the watcher, verify ignores anything from before the address was watched, so old history
  // can't be pushed into a merchant's reconciliation through the public endpoint.
  const owner = await deps.prisma.watcherCursor.findUnique({ where: { destination: req.destination } });
  const merchantId = owner?.merchantId ?? req.merchantId;
  const ops: IncomingOp[] = [];
  let early = false;
  for (const record of records) {
    const decoded = decodePaymentRecord(record, req.destination, record.transaction ?? tx);
    if (isSkip(decoded)) continue;
    if (owner && decoded.ledgerClosedAt.getTime() < owner.watchFrom.getTime()) {
      early = true;
      continue;
    }
    ops.push(decoded);
  }
  if (ops.length === 0) {
    throw new AppError(
      "TX_NOT_RELEVANT",
      early
        ? "This transaction is from before MoyaPay started watching this address"
        : `This transaction makes no payment to ${req.destination}`,
    );
  }

  const results: ProcessResult[] = [];
  for (const op of ops) {
    results.push(await deps.prisma.$transaction((t) => processOperation(t, op, merchantId, "verify")));
  }
  return results;
}
