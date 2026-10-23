import type { PrismaClient, WatcherCursor } from "@prisma/client";
import type { Logger } from "pino";
import { cursorForLedger, ledgerOfPagingToken, type Horizon, type HorizonPaymentRecord } from "../lib/stellar/horizon";
import { decodePaymentRecord, isSkip } from "./decode";
import { processOperation } from "./matcher";
import type { IncomingOp } from "./types";

export const HEARTBEAT_ID = "watcher";
const PAGE_LIMIT = 200;
/** Skipped records only move the cursor; it is saved at most this often. */
const CURSOR_FLUSH_MS = 5000;
/**
 * Horizon sends nothing on an idle stream (no keepalives), so silence can't tell a quiet account
 * from a dead connection. An idle stream is recycled after this long: the catch-up page read
 * that follows is what proves the destination is processed up to the tip (syncedAt), and it
 * also picks up anything a stalled stream failed to deliver.
 */
export const DEFAULT_IDLE_MS = 25_000;
/** A heartbeat slower than this is logged with the time spent in each step. */
const SLOW_HEARTBEAT_MS = 8000;
const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 };

export interface WatcherDeps {
  prisma: PrismaClient;
  horizon: Horizon;
  logger: Logger;
  /** Recycle a stream that is silent this long (see DEFAULT_IDLE_MS). */
  idleMs?: number;
  /** Test seam: runs inside the transaction after each processed payment (crash simulation). */
  afterPayment?: (op: IncomingOp) => void | Promise<void>;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

/**
 * Moves syncedAt forward (never back) and marks the stream connected. Called only after a
 * catch-up page read, which proves every payment up to `to` has been processed.
 */
async function advanceSyncedAt(prisma: PrismaClient, destination: string, to: Date): Promise<void> {
  await prisma.watcherCursor.updateMany({
    where: { destination, connected: false },
    data: { connected: true, lastError: null },
  });
  await prisma.watcherCursor.updateMany({
    where: { destination, OR: [{ syncedAt: null }, { syncedAt: { lt: to } }] },
    data: { syncedAt: to },
  });
}

export function backoffMs(failures: number): number {
  return failures === 0 ? 500 : Math.min(1000 * 2 ** (failures - 1), 30_000);
}

/** Watches one destination: catch up from the saved cursor, then stream; repeat forever. */
export class DestinationWatcher {
  readonly destination: string;
  /** Updated by Watcher.refresh() when the address changes owner (its wallet's owner signs in). */
  merchantId: string;
  private readonly watchFrom: Date;
  private cursor: string | null;
  private dirtyCursor = false;
  private lastFlush = 0;
  private failures = 0;
  connected = false;
  /** True once the backlog since the cursor is processed, until the stream drops. */
  caughtUp = false;
  busy = false;
  lastError: string | null = null;

  constructor(
    row: WatcherCursor,
    private readonly deps: WatcherDeps,
  ) {
    this.destination = row.destination;
    this.merchantId = row.merchantId;
    this.watchFrom = row.watchFrom;
    this.cursor = row.pagingToken;
  }

  async run(signal: AbortSignal): Promise<void> {
    const { horizon, logger } = this.deps;
    while (!signal.aborted) {
      try {
        await this.catchUp(signal);
        this.connected = true;
        this.lastError = null;
        for await (const record of horizon.streamAccountPayments(this.destination, this.cursor ?? "now", {
          signal,
          idleMs: this.deps.idleMs ?? DEFAULT_IDLE_MS,
        })) {
          await this.handle(record);
          this.failures = 0;
          if (signal.aborted) break;
        }
        // Horizon closed the stream or it went quiet: catch up again (which advances syncedAt)
        // and reopen it from the cursor. Still connected; no back-off.
        this.failures = 0;
        await this.flushCursor(true).catch(() => undefined);
        continue;
      } catch (err) {
        this.failures++;
        this.lastError = (err as Error).message.slice(0, 300);
        const level = this.failures > 1 ? "warn" : "error";
        logger[level](
          { err, destination: this.destination, failures: this.failures, retryInMs: backoffMs(this.failures) },
          "watcher stream failed",
        );
      }
      this.connected = false;
      this.caughtUp = false;
      await this.flushCursor(true).catch(() => undefined);
      await sleep(backoffMs(this.failures), signal);
    }
    await this.flushCursor(true).catch(() => undefined);
  }

  /** Pages through everything after the cursor (backfill after a restart or a dropped stream). */
  private async catchUp(signal: AbortSignal): Promise<void> {
    const { horizon, prisma } = this.deps;
    const tip = await horizon.latestLedger();
    for (;;) {
      const page = await horizon.accountPayments(this.destination, this.cursor, PAGE_LIMIT);
      for (const record of page) {
        if (signal.aborted) return;
        await this.handle(record);
      }
      if (page.length < PAGE_LIMIT) break;
    }
    // An address with no payments at all: start the stream at the tip read before paging, so
    // nothing that closed in between is skipped.
    if (this.cursor === null) {
      this.cursor = cursorForLedger(tip.ledger);
      this.dirtyCursor = true;
    }
    await this.flushCursor(true);
    // Everything up to the tip read before paging has now been processed.
    await advanceSyncedAt(prisma, this.destination, tip.closedAt);
    this.caughtUp = true;
  }

  private async handle(record: HorizonPaymentRecord): Promise<void> {
    this.busy = true;
    try {
      const tx = record.transaction ?? (await this.deps.horizon.transaction(record.transaction_hash)) ?? undefined;
      const decoded = decodePaymentRecord(record, this.destination, tx);
      if (isSkip(decoded) || decoded.ledgerClosedAt.getTime() < this.watchFrom.getTime()) {
        // Not an incoming payment, or older than this address being watched: only advance.
        this.cursor = record.paging_token;
        this.dirtyCursor = true;
        await this.flushCursor(false);
        return;
      }
      const op = decoded;
      await this.deps.prisma.$transaction(async (t) => {
        await processOperation(t, op, this.merchantId, "watcher");
        await this.deps.afterPayment?.(op);
        // The cursor moves in the same transaction as the payment it covers.
        await t.watcherCursor.update({
          where: { destination: this.destination },
          data: { pagingToken: op.pagingToken, lastLedger: op.ledger, lastLedgerAt: op.ledgerClosedAt },
        });
      }, TX_OPTIONS);
      this.cursor = op.pagingToken;
      this.dirtyCursor = false;
      this.lastFlush = Date.now();
    } finally {
      this.busy = false;
    }
  }

  private async flushCursor(force: boolean): Promise<void> {
    if (!this.dirtyCursor || this.cursor === null) return;
    if (!force && Date.now() - this.lastFlush < CURSOR_FLUSH_MS) return;
    const ledger = ledgerOfPagingToken(this.cursor);
    await this.deps.prisma.watcherCursor.update({
      where: { destination: this.destination },
      data: { pagingToken: this.cursor, ...(ledger !== null ? { lastLedger: ledger } : {}) },
    });
    this.dirtyCursor = false;
    this.lastFlush = Date.now();
  }
}

/**
 * Runs one DestinationWatcher per WatcherCursor row and writes the heartbeat. New
 * destinations are picked up on NOTIFY destinations_changed (markDirty) or within 10 s.
 */
export class Watcher {
  private readonly running = new Map<string, { watcher: DestinationWatcher; done: Promise<void> }>();
  private dirty = true;
  private loadedAt = 0;
  private signal: AbortSignal | null = null;

  constructor(private readonly deps: WatcherDeps) {}

  markDirty = (): void => {
    this.dirty = true;
  };

  get watchers(): DestinationWatcher[] {
    return [...this.running.values()].map((r) => r.watcher);
  }

  /** Starts watchers for destinations that have none yet. */
  async refresh(signal: AbortSignal, force = false): Promise<number> {
    this.signal = signal;
    if (!force && !this.dirty && Date.now() - this.loadedAt < 10_000) return 0;
    this.dirty = false;
    this.loadedAt = Date.now();
    const rows = await this.deps.prisma.watcherCursor.findMany();
    let started = 0;
    for (const row of rows) {
      const existing = this.running.get(row.destination);
      if (existing) {
        existing.watcher.merchantId = row.merchantId;
        continue;
      }
      if (signal.aborted) continue;
      const watcher = new DestinationWatcher(row, this.deps);
      const done = watcher.run(signal).catch((err: unknown) => {
        this.deps.logger.error({ err, destination: row.destination }, "watcher crashed");
      });
      this.running.set(row.destination, { watcher, done });
      started++;
    }
    if (started > 0) this.deps.logger.info({ started, total: this.running.size }, "watching destinations");
    return started;
  }

  /**
   * Records the chain tip and the stream states. It never moves syncedAt: only a catch-up page
   * read can prove a destination is processed up to a point.
   */
  async heartbeat(): Promise<void> {
    const { prisma, horizon } = this.deps;
    const started = Date.now();
    const timings: Record<string, number> = {};
    let tip: { ledger: number; closedAt: Date } | null = null;
    try {
      tip = await horizon.latestLedger();
    } catch (err) {
      this.deps.logger.warn({ err }, "heartbeat: could not read the latest ledger");
    }
    timings.tip = Date.now() - started;
    const now = new Date();
    const watchers = this.watchers;
    const connected = watchers.filter((w) => w.connected);
    await prisma.watcherHeartbeat.upsert({
      where: { id: HEARTBEAT_ID },
      create: {
        id: HEARTBEAT_ID,
        beatAt: now,
        latestLedger: tip?.ledger ?? null,
        latestLedgerAt: tip?.closedAt ?? null,
        streams: watchers.length,
        connectedStreams: connected.length,
      },
      update: {
        beatAt: now,
        ...(tip ? { latestLedger: tip.ledger, latestLedgerAt: tip.closedAt } : {}),
        streams: watchers.length,
        connectedStreams: connected.length,
      },
    });
    timings.beat = Date.now() - started;
    for (const w of watchers) {
      if (w.connected) continue;
      // Only on the transition to disconnected, so updatedAt says since when (health check).
      await prisma.watcherCursor.updateMany({
        where: { destination: w.destination, connected: true },
        data: { connected: false, lastError: w.lastError },
      });
    }
    timings.total = Date.now() - started;
    if (timings.total > SLOW_HEARTBEAT_MS) this.deps.logger.warn({ timingsMs: timings }, "slow watcher heartbeat");
  }

  /** Waits for every stream to finish after the signal passed to refresh() aborts. */
  async stopped(): Promise<void> {
    if (this.signal && !this.signal.aborted) throw new Error("abort the signal first");
    await Promise.all([...this.running.values()].map((r) => r.done));
  }
}
