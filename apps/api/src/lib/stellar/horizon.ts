import { AppError } from "../errors";

// Horizon is the only chain source MoyaPay uses: the watcher's payment streams, the
// verify-by-hash lookup and account checks. Everything goes through this interface so tests
// can swap in a fake.

export interface HorizonTx {
  hash: string;
  successful: boolean;
  ledger: number;
  created_at: string;
  memo?: string;
  memo_type?: string;
  /** base64 TransactionResult; carries the failure codes of a failed transaction */
  result_xdr?: string;
  envelope_xdr?: string;
  /** TOID of the transaction; operation ids are this + 1, + 2, … */
  paging_token?: string;
  source_account?: string;
}

/** A record from /accounts/{id}/payments or /transactions/{hash}/payments. */
export interface HorizonPaymentRecord {
  id: string;
  paging_token: string;
  type: string;
  created_at: string;
  transaction_hash: string;
  transaction_successful?: boolean;
  source_account?: string;
  from?: string;
  to?: string;
  amount?: string;
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  /** Present with join=transactions. */
  transaction?: HorizonTx;
}

export interface Trustline {
  code: string;
  issuer: string;
  balance: string;
  limit: string;
  authorized: boolean;
}

export type AccountState = { exists: false } | { exists: true; trustlines: Trustline[] };

export interface LedgerTip {
  ledger: number;
  closedAt: Date;
}

export interface Horizon {
  latestLedger(): Promise<LedgerTip>;
  account(address: string): Promise<AccountState>;
  /** null when Horizon does not know the hash (never submitted, or rejected before the ledger). */
  transaction(hash: string): Promise<HorizonTx | null>;
  /** The payment operations of one transaction, including a failed one, with the transaction joined. */
  transactionPayments(hash: string): Promise<HorizonPaymentRecord[]>;
  /** One page of an account's payments after `cursor`, oldest first, failed ones included. */
  accountPayments(address: string, cursor: string | null, limit: number): Promise<HorizonPaymentRecord[]>;
  /**
   * The live stream of an account's payments after `cursor`. Ends (returns) when Horizon
   * closes the stream or nothing arrives for `idleMs`; throws on connection errors.
   */
  streamAccountPayments(
    address: string,
    cursor: string,
    opts: { signal: AbortSignal; idleMs?: number },
  ): AsyncIterable<HorizonPaymentRecord>;
}

export class HorizonError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "HorizonError";
  }
}

/** TOID of the first possible operation in a ledger (ledger << 32): a cursor that starts there. */
export function cursorForLedger(ledger: number): string {
  return (BigInt(ledger) << 32n).toString();
}

export function ledgerOfPagingToken(token: string): number | null {
  if (!/^\d{1,20}$/.test(token)) return null;
  const ledger = BigInt(token) >> 32n;
  return ledger > 0n && ledger < 2n ** 31n ? Number.parseInt(ledger.toString(), 10) : null;
}

interface HorizonBalance {
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  balance?: string;
  limit?: string;
  is_authorized?: boolean;
}

interface Page<T> {
  _embedded?: { records?: T[] };
}

export class HorizonClient implements Horizon {
  private readonly base: string;

  constructor(
    horizonUrl: string,
    private readonly timeoutMs = 10_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.base = horizonUrl.replace(/\/$/, "");
  }

  private async get<T>(path: string): Promise<T | null> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}${path}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new HorizonError(`Horizon unreachable: ${(err as Error).message}`, null);
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new HorizonError(`Horizon answered HTTP ${res.status} for ${path.split("?")[0]}`, res.status);
    return (await res.json()) as T;
  }

  async latestLedger(): Promise<LedgerTip> {
    const page = await this.get<Page<{ sequence: number; closed_at: string }>>("/ledgers?order=desc&limit=1");
    const record = page?._embedded?.records?.[0];
    if (!record) throw new HorizonError("Horizon returned no ledgers", null);
    return { ledger: record.sequence, closedAt: new Date(record.closed_at) };
  }

  async account(address: string): Promise<AccountState> {
    let body: { balances?: HorizonBalance[] } | null;
    try {
      body = await this.get<{ balances?: HorizonBalance[] }>(`/accounts/${address}`);
    } catch {
      throw new AppError("HORIZON_UNAVAILABLE", "Could not reach Stellar to check this account", { retryAfter: 10 });
    }
    if (!body) return { exists: false };
    const trustlines: Trustline[] = [];
    for (const b of body.balances ?? []) {
      if (!b.asset_code || !b.asset_issuer) continue; // native and pool shares
      trustlines.push({
        code: b.asset_code,
        issuer: b.asset_issuer,
        balance: b.balance ?? "0",
        limit: b.limit ?? "0",
        authorized: b.is_authorized !== false,
      });
    }
    return { exists: true, trustlines };
  }

  async transaction(hash: string): Promise<HorizonTx | null> {
    return this.get<HorizonTx>(`/transactions/${hash}`);
  }

  async transactionPayments(hash: string): Promise<HorizonPaymentRecord[]> {
    const page = await this.get<Page<HorizonPaymentRecord>>(
      `/transactions/${hash}/payments?limit=200&include_failed=true&join=transactions`,
    );
    return page?._embedded?.records ?? [];
  }

  async accountPayments(address: string, cursor: string | null, limit: number): Promise<HorizonPaymentRecord[]> {
    const from = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    const page = await this.get<Page<HorizonPaymentRecord>>(
      `/accounts/${address}/payments?order=asc&limit=${limit}&include_failed=true&join=transactions${from}`,
    );
    return page?._embedded?.records ?? [];
  }

  async *streamAccountPayments(
    address: string,
    cursor: string,
    opts: { signal: AbortSignal; idleMs?: number },
  ): AsyncIterable<HorizonPaymentRecord> {
    const idleMs = opts.idleMs ?? 60_000;
    const controller = new AbortController();
    const abort = () => controller.abort();
    opts.signal.addEventListener("abort", abort, { once: true });
    let idle = setTimeout(abort, idleMs);
    const touch = () => {
      clearTimeout(idle);
      idle = setTimeout(abort, idleMs);
    };
    try {
      const url =
        `${this.base}/accounts/${address}/payments?cursor=${encodeURIComponent(cursor)}` +
        `&include_failed=true&join=transactions`;
      let res: Response;
      try {
        res = await this.fetchImpl(url, { headers: { accept: "text/event-stream" }, signal: controller.signal });
      } catch (err) {
        if (controller.signal.aborted) return;
        throw new HorizonError(`Horizon stream failed to open: ${(err as Error).message}`, null);
      }
      if (res.status === 404) throw new HorizonError("Account not found on Horizon", 404);
      if (!res.ok || !res.body) throw new HorizonError(`Horizon stream answered HTTP ${res.status}`, res.status);

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        let chunk: Awaited<ReturnType<typeof reader.read>>;
        try {
          chunk = await reader.read();
        } catch (err) {
          if (controller.signal.aborted) return; // idle timeout or shutdown: reconnect from the cursor
          throw new HorizonError(`Horizon stream broke: ${(err as Error).message}`, null);
        }
        if (chunk.done) return;
        touch();
        buffer += chunk.value.replace(/\r/g, "");
        let end: number;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = block
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          // Horizon opens with "hello" and closes with "byebye"; neither is a record.
          if (!data || data === '"hello"' || data === '"byebye"') continue;
          let record: unknown;
          try {
            record = JSON.parse(data);
          } catch {
            continue;
          }
          if (record && typeof record === "object" && "paging_token" in record) {
            yield record as HorizonPaymentRecord;
          }
        }
      }
    } finally {
      clearTimeout(idle);
      opts.signal.removeEventListener("abort", abort);
      controller.abort();
    }
  }
}
