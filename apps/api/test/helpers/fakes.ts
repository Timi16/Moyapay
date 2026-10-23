import { Keypair, xdr } from "@stellar/stellar-sdk";
import type {
  AccountState,
  Horizon,
  HorizonPaymentRecord,
  HorizonTx,
  LedgerTip,
} from "../../src/lib/stellar/horizon";
import { HorizonError } from "../../src/lib/stellar/horizon";
import { USDC_ISSUER } from "./setupEnv";

/** Result XDR of a transaction whose one payment failed with op_underfunded. */
export function failedResultXdr(): string {
  return new xdr.TransactionResult({
    feeCharged: 100n,
    result: xdr.TransactionResultResult.txFailed([
      xdr.OperationResult.opInner(xdr.OperationResultTr.payment(xdr.PaymentResult.paymentUnderfunded())),
    ]),
    ext: xdr.TransactionResultExt.v0(),
  }).toXdr("base64");
}

export const randomAddress = () => Keypair.random().publicKey();
export const randomHash = () =>
  Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");

/** TOID of an operation: ledger << 32 | tx order << 12 | op index (1-based). */
export function toid(ledger: number, txOrder = 1, opIndex = 1): string {
  return ((BigInt(ledger) << 32n) | (BigInt(txOrder) << 12n) | BigInt(opIndex)).toString();
}

export interface PaymentInput {
  to: string;
  from?: string;
  amount?: string;
  /** "USDC" (the real issuer), "XLM", or { code, issuer } */
  asset?: "USDC" | "XLM" | { code: string; issuer: string };
  memo?: string | null;
  memoType?: "text" | "id" | "hash" | "none";
  successful?: boolean;
  resultXdr?: string;
  type?: "payment" | "path_payment_strict_receive" | "path_payment_strict_send" | "create_account";
  ledger?: number;
  txOrder?: number;
  opIndex?: number;
  closedAt?: Date;
  txHash?: string;
}

let ledgerCounter = 2_000_000;

/** A Horizon payment record with its transaction joined, as the payments endpoint returns it. */
export function paymentRecord(input: PaymentInput): HorizonPaymentRecord {
  const ledger = input.ledger ?? ++ledgerCounter;
  const id = toid(ledger, input.txOrder ?? 1, input.opIndex ?? 1);
  const createdAt = (input.closedAt ?? new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
  const hash = input.txHash ?? randomHash();
  const asset = input.asset ?? "USDC";
  const memoType = input.memoType ?? (input.memo === null || input.memo === undefined ? "none" : "text");
  const successful = input.successful ?? true;
  const tx: HorizonTx = {
    hash,
    successful,
    ledger,
    created_at: createdAt,
    memo_type: memoType,
    ...(memoType !== "none" && input.memo !== null && input.memo !== undefined ? { memo: input.memo } : {}),
    ...(input.resultXdr ? { result_xdr: input.resultXdr } : {}),
    paging_token: toid(ledger, input.txOrder ?? 1, 0),
  };
  return {
    id,
    paging_token: id,
    type: input.type ?? "payment",
    created_at: createdAt,
    transaction_hash: hash,
    transaction_successful: successful,
    from: input.from ?? randomAddress(),
    to: input.to,
    amount: input.amount ?? "10.0000000",
    ...(asset === "XLM"
      ? { asset_type: "native" }
      : asset === "USDC"
        ? { asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: USDC_ISSUER }
        : { asset_type: "credit_alphanum4", asset_code: asset.code, asset_issuer: asset.issuer }),
    transaction: tx,
  };
}

/**
 * In-memory Horizon. `addPayment` records a payment the way the chain would: it shows up in the
 * account's history, in /transactions/{hash} and in every open stream on that account.
 */
export class FakeHorizon implements Horizon {
  tip: LedgerTip = { ledger: 1_000_000, closedAt: new Date() };
  /** Addresses without an entry exist and hold a USDC trustline. */
  readonly accounts = new Map<string, AccountState>();
  readonly history = new Map<string, HorizonPaymentRecord[]>();
  readonly txs = new Map<string, HorizonTx>();
  readonly txRecords = new Map<string, HorizonPaymentRecord[]>();
  unreachable = false;
  streamsOpened = 0;
  private waiters = new Set<() => void>();
  /** Ends every open stream (like Horizon closing the connection). */
  private generation = 0;

  addPayment(record: HorizonPaymentRecord): HorizonPaymentRecord {
    for (const address of new Set([record.to, record.from].filter((a): a is string => Boolean(a)))) {
      const list = this.history.get(address) ?? [];
      list.push(record);
      list.sort((a, b) => (BigInt(a.paging_token) < BigInt(b.paging_token) ? -1 : 1));
      this.history.set(address, list);
    }
    if (record.transaction) this.txs.set(record.transaction_hash, record.transaction);
    const forTx = this.txRecords.get(record.transaction_hash) ?? [];
    forTx.push(record);
    this.txRecords.set(record.transaction_hash, forTx);
    const ledger = Number.parseInt((BigInt(record.paging_token) >> 32n).toString(), 10);
    if (ledger > this.tip.ledger) this.tip = { ledger, closedAt: new Date(record.created_at) };
    this.wake();
    return record;
  }

  dropStreams(): void {
    this.generation++;
    this.wake();
  }

  private wake(): void {
    for (const w of [...this.waiters]) w();
  }

  private check(): void {
    if (this.unreachable) throw new HorizonError("Horizon unreachable (fake)", null);
  }

  async latestLedger(): Promise<LedgerTip> {
    this.check();
    return this.tip;
  }

  async account(address: string): Promise<AccountState> {
    this.check();
    return (
      this.accounts.get(address) ?? {
        exists: true,
        trustlines: [{ code: "USDC", issuer: USDC_ISSUER, balance: "100.0000000", limit: "1000000", authorized: true }],
      }
    );
  }

  async transaction(hash: string): Promise<HorizonTx | null> {
    this.check();
    return this.txs.get(hash) ?? null;
  }

  async transactionPayments(hash: string): Promise<HorizonPaymentRecord[]> {
    this.check();
    return this.txRecords.get(hash) ?? [];
  }

  async accountPayments(address: string, cursor: string | null, limit: number): Promise<HorizonPaymentRecord[]> {
    this.check();
    const list = this.history.get(address) ?? [];
    return list.filter((r) => cursor === null || BigInt(r.paging_token) > BigInt(cursor)).slice(0, limit);
  }

  async *streamAccountPayments(
    address: string,
    cursor: string,
    opts: { signal: AbortSignal; idleMs?: number },
  ): AsyncIterable<HorizonPaymentRecord> {
    this.check();
    this.streamsOpened++;
    const generation = this.generation;
    let last = BigInt(cursor);
    while (!opts.signal.aborted && generation === this.generation) {
      const next = (this.history.get(address) ?? []).find((r) => BigInt(r.paging_token) > last);
      if (next) {
        last = BigInt(next.paging_token);
        yield next;
        continue;
      }
      // Like the real client: a stream silent for idleMs ends (and the watcher catches up).
      const idle = await new Promise<boolean>((resolve) => {
        const timer = opts.idleMs ? setTimeout(() => finish(true), opts.idleMs) : null;
        const done = () => finish(false);
        function finish(timedOut: boolean) {
          if (timer) clearTimeout(timer);
          waiters.delete(done);
          opts.signal.removeEventListener("abort", done);
          resolve(timedOut);
        }
        const waiters = this.waiters;
        waiters.add(done);
        opts.signal.addEventListener("abort", done, { once: true });
      });
      if (idle) return;
    }
  }
}
