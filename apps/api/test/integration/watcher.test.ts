import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { expireOverdue } from "../../src/engine/expiry";
import { watcherStatus, WatcherHealth } from "../../src/engine/status";
import { Watcher } from "../../src/engine/watcher";
import { cursorForLedger } from "../../src/lib/stellar/horizon";
import type { Alerter } from "../../src/engine/alerter";
import { failedResultXdr, toid } from "../helpers/fakes";
import {
  createMerchant,
  createRequest,
  FakeHorizon,
  paymentRecord,
  prisma,
  resetDb,
  silentLogger,
  waitFor,
} from "../helpers/harness";

let controller: AbortController;
let watcher: Watcher | null = null;

async function start(horizon: FakeHorizon, idleMs = 60_000, missingAccountRetryMs?: number): Promise<Watcher> {
  controller = new AbortController();
  watcher = new Watcher({ prisma, horizon, logger: silentLogger, idleMs, missingAccountRetryMs });
  await watcher.refresh(controller.signal, true);
  return watcher;
}

async function stop(): Promise<void> {
  if (!watcher) return;
  controller.abort();
  await watcher.stopped();
  watcher = null;
}

const statusOf = async (id: string) => (await prisma.paymentRequest.findUniqueOrThrow({ where: { id } })).status;

beforeEach(resetDb);
afterEach(stop);

describe("watcher", () => {
  it("streams a payment, verifies it and marks the request PAID; the cursor moves with it", async () => {
    const horizon = new FakeHorizon();
    const m = await createMerchant();
    const req = await createRequest(m, { amount: "25" });
    await start(horizon);
    await waitFor(async () => watcher?.watchers[0]?.caughtUp);

    const rec = horizon.addPayment(paymentRecord({ to: m.walletAddress, amount: "25", memo: req.reference }));
    await waitFor(async () => (await statusOf(req.id)) === "PAID");
    const cursor = await prisma.watcherCursor.findUniqueOrThrow({ where: { destination: m.walletAddress } });
    expect(cursor.pagingToken).toBe(rec.paging_token);
    const payment = await prisma.incomingPayment.findFirstOrThrow();
    expect(payment).toMatchObject({ result: "MATCHED", source: "watcher", txHash: rec.transaction_hash });
  });

  it("backfills on boot: payments made while the watcher was down are picked up from the saved cursor", async () => {
    const horizon = new FakeHorizon();
    const m = await createMerchant();
    const reqs = await Promise.all([createRequest(m), createRequest(m), createRequest(m)]);
    for (const r of reqs) horizon.addPayment(paymentRecord({ to: m.walletAddress, amount: "50", memo: r.reference }));
    await start(horizon);
    await waitFor(async () => (await prisma.paymentRequest.count({ where: { status: "PAID" } })) === 3);
  });

  it("restarting from an old cursor counts nothing twice and logs the duplicates", async () => {
    const horizon = new FakeHorizon();
    const m = await createMerchant();
    const reqs = await Promise.all([createRequest(m), createRequest(m)]);
    for (const r of reqs) horizon.addPayment(paymentRecord({ to: m.walletAddress, amount: "50", memo: r.reference }));
    await start(horizon);
    await waitFor(async () => (await prisma.paymentRequest.count({ where: { status: "PAID" } })) === 2);
    await stop();

    // Rewind the cursor to before both payments and start again.
    await prisma.watcherCursor.update({ where: { destination: m.walletAddress }, data: { pagingToken: null } });
    await start(horizon);
    await waitFor(async () => (await prisma.requestEvent.count({ where: { type: "DUPLICATE_IGNORED" } })) === 2);
    expect(await prisma.incomingPayment.count()).toBe(2);
    expect(await prisma.requestEvent.count({ where: { type: "PAID" } })).toBe(2);
  });

  it("ignores payments from before the address was watched, and the merchant's own outgoing payments", async () => {
    const horizon = new FakeHorizon();
    const m = await createMerchant();
    await prisma.watcherCursor.update({ where: { destination: m.walletAddress }, data: { watchFrom: new Date() } });
    horizon.addPayment(paymentRecord({ to: m.walletAddress, memo: null, closedAt: new Date(Date.now() - 600_000) }));
    horizon.addPayment(paymentRecord({ to: "GSOMEONEELSE", from: m.walletAddress }));
    await start(horizon);
    await waitFor(async () => watcher?.watchers[0]?.caughtUp);
    horizon.addPayment(paymentRecord({ to: m.walletAddress, memo: null, closedAt: new Date(Date.now() + 1000) }));
    await waitFor(async () => (await prisma.incomingPayment.count()) === 1);
    expect((await prisma.incomingPayment.findFirstOrThrow()).result).toBe("UNMATCHED");
  });

  it("records a failed transaction from the stream and fails the request", async () => {
    const horizon = new FakeHorizon();
    const m = await createMerchant();
    const req = await createRequest(m);
    await start(horizon);
    horizon.addPayment(
      paymentRecord({ to: m.walletAddress, amount: "50", memo: req.reference, successful: false, resultXdr: failedResultXdr() }),
    );
    await waitFor(async () => (await statusOf(req.id)) === "FAILED");
  });

  it("reconnects when Horizon drops the stream, and resumes without gaps", async () => {
    const horizon = new FakeHorizon();
    const m = await createMerchant();
    const [a, b] = await Promise.all([createRequest(m), createRequest(m)]);
    await start(horizon);
    await waitFor(async () => watcher?.watchers[0]?.connected);
    horizon.dropStreams();
    if (!a || !b) throw new Error("setup");
    horizon.addPayment(paymentRecord({ to: m.walletAddress, amount: "50", memo: a.reference }));
    horizon.addPayment(paymentRecord({ to: m.walletAddress, amount: "50", memo: b.reference }));
    await waitFor(async () => (await prisma.paymentRequest.count({ where: { status: "PAID" } })) === 2);
    // The catch-up pass after the drop processes them; then the stream is opened again.
    await waitFor(async () => horizon.streamsOpened >= 2);
  });

  it("the heartbeat records the tip and the stream counts, but never moves syncedAt", async () => {
    const horizon = new FakeHorizon();
    const m = await createMerchant();
    const tipAtStart = horizon.tip.closedAt;
    const w = await start(horizon);
    await waitFor(async () => w.watchers[0]?.caughtUp);
    horizon.tip = { ledger: 1_234_567, closedAt: new Date(Date.now() + 60_000) };
    await w.heartbeat();
    const status = await watcherStatus(prisma);
    expect(status).toMatchObject({ healthy: true, latestLedger: 1_234_567, streams: { total: 1, connected: 1 } });
    // syncedAt is the tip read by the catch-up, not the newer tip the heartbeat saw: an idle
    // stream proves nothing (Horizon sends no keepalives).
    const cursor = await prisma.watcherCursor.findUniqueOrThrow({ where: { destination: m.walletAddress } });
    expect(cursor.syncedAt?.getTime()).toBe(tipAtStart.getTime());
  });

  it("an idle stream is recycled, and the catch-up after it moves syncedAt forward", async () => {
    const horizon = new FakeHorizon();
    const m = await createMerchant();
    await start(horizon, 150);
    await waitFor(async () => (await prisma.watcherCursor.findUniqueOrThrow({ where: { destination: m.walletAddress } })).syncedAt);
    const later = new Date(Date.now() + 5000);
    horizon.tip = { ledger: horizon.tip.ledger + 5, closedAt: later };
    await waitFor(async () => {
      const c = await prisma.watcherCursor.findUniqueOrThrow({ where: { destination: m.walletAddress } });
      return c.syncedAt?.getTime() === later.getTime();
    });
    expect(horizon.streamsOpened).toBeGreaterThanOrEqual(2);
  });

  it("a wallet that doesn't exist on testnet yet counts as watched, not broken, and is picked up once funded", async () => {
    const horizon = new FakeHorizon();
    const m = await createMerchant();
    horizon.missing.add(m.walletAddress);
    const w = await start(horizon, 60_000, 200);
    await waitFor(async () => w.watchers[0]?.connected && w.watchers[0]?.caughtUp);
    await w.heartbeat();
    expect(await watcherStatus(prisma)).toMatchObject({ healthy: true, streams: { total: 1, connected: 1 } });
    // Funded later, then paid: the watcher notices without a restart.
    horizon.missing.delete(m.walletAddress);
    const req = await createRequest(m);
    horizon.addPayment(paymentRecord({ to: m.walletAddress, amount: "50", memo: req.reference }));
    await waitFor(async () => (await statusOf(req.id)) === "PAID");
  });

  it("picks up a new owner of an address without restarting", async () => {
    const horizon = new FakeHorizon();
    const a = await createMerchant();
    const b = await createMerchant();
    const w = await start(horizon);
    await waitFor(async () => w.watchers.find((x) => x.destination === a.walletAddress)?.caughtUp);
    await prisma.watcherCursor.update({ where: { destination: a.walletAddress }, data: { merchantId: b.id } });
    await w.refresh(controller.signal, true);
    horizon.addPayment(paymentRecord({ to: a.walletAddress, memo: null }));
    await waitFor(async () => (await prisma.incomingPayment.count()) === 1);
    expect((await prisma.incomingPayment.findFirstOrThrow()).merchantId).toBe(b.id);
  });

  it("starts an address with no payment history at the current tip", async () => {
    const horizon = new FakeHorizon();
    horizon.tip = { ledger: 5000, closedAt: new Date() };
    const m = await createMerchant();
    await start(horizon);
    await waitFor(async () => watcher?.watchers[0]?.caughtUp);
    const cursor = await prisma.watcherCursor.findUniqueOrThrow({ where: { destination: m.walletAddress } });
    expect(cursor.pagingToken).toBe(cursorForLedger(5000));
  });

  it("picks up records after the saved cursor only", async () => {
    const horizon = new FakeHorizon();
    const m = await createMerchant();
    const old = paymentRecord({ to: m.walletAddress, memo: null, ledger: 100 });
    horizon.addPayment(old);
    await prisma.watcherCursor.update({ where: { destination: m.walletAddress }, data: { pagingToken: toid(100, 1, 1) } });
    horizon.addPayment(paymentRecord({ to: m.walletAddress, memo: null, ledger: 101 }));
    await start(horizon);
    await waitFor(async () => (await prisma.incomingPayment.count()) === 1);
    expect((await prisma.incomingPayment.findFirstOrThrow()).ledger).toBe(101);
  });
});

describe("expiry cron", () => {
  it("expires PENDING and FAILED requests once the watcher is synced past expiresAt", async () => {
    const m = await createMerchant();
    const past = new Date(Date.now() - 120_000);
    const pending = await createRequest(m, { expiresAt: past });
    const failed = await createRequest(m, { expiresAt: past });
    await prisma.paymentRequest.updateMany({ where: { id: failed.id }, data: { status: "FAILED" } }); // eslint-disable-line no-restricted-syntax -- test setup
    const open = await createRequest(m, { expiresAt: new Date(Date.now() + 3600_000) });
    const never = await createRequest(m, { expiresAt: null });
    await prisma.watcherCursor.update({ where: { destination: m.walletAddress }, data: { syncedAt: new Date() } });

    expect(await expireOverdue(prisma)).toBe(2);
    expect(await statusOf(pending.id)).toBe("EXPIRED");
    expect(await statusOf(failed.id)).toBe("EXPIRED");
    expect(await statusOf(open.id)).toBe("PENDING");
    expect(await statusOf(never.id)).toBe("PENDING");
    expect(await prisma.requestEvent.count({ where: { type: "EXPIRED" } })).toBe(2);
  });

  it("waits while the watcher has not processed the destination past expiresAt", async () => {
    const m = await createMerchant();
    const req = await createRequest(m, { expiresAt: new Date(Date.now() - 60_000) });
    // Watcher down since before the expiry: nothing may be expired yet.
    await prisma.watcherCursor.update({
      where: { destination: m.walletAddress },
      data: { syncedAt: new Date(Date.now() - 300_000) },
    });
    expect(await expireOverdue(prisma)).toBe(0);
    expect(await statusOf(req.id)).toBe("PENDING");
  });

  it("one destination stuck behind with many overdue requests does not block the others", async () => {
    const stuck = await createMerchant();
    const fine = await createMerchant();
    const old = new Date(Date.now() - 3600_000);
    for (let i = 0; i < 5; i++) await createRequest(stuck, { expiresAt: old });
    const req = await createRequest(fine, { expiresAt: new Date(Date.now() - 60_000) });
    await prisma.watcherCursor.update({ where: { destination: stuck.walletAddress }, data: { syncedAt: new Date(Date.now() - 7200_000) } });
    await prisma.watcherCursor.update({ where: { destination: fine.walletAddress }, data: { syncedAt: new Date() } });
    expect(await expireOverdue(prisma)).toBe(1);
    expect(await statusOf(req.id)).toBe("EXPIRED");
  });

  it("never touches PAID requests", async () => {
    const m = await createMerchant();
    const req = await createRequest(m, { expiresAt: new Date(Date.now() - 60_000) });
    await prisma.paymentRequest.updateMany({ where: { id: req.id }, data: { status: "PAID" } }); // eslint-disable-line no-restricted-syntax -- test setup
    await prisma.watcherCursor.update({ where: { destination: m.walletAddress }, data: { syncedAt: new Date() } });
    expect(await expireOverdue(prisma)).toBe(0);
  });

  it("queues request.expired", async () => {
    const m = await createMerchant();
    await prisma.merchant.update({
      where: { id: m.id },
      data: { webhookUrl: "https://example.com/hook", webhookEvents: ["request.expired"] },
    });
    await createRequest(m, { expiresAt: new Date(Date.now() - 60_000) });
    await prisma.watcherCursor.update({ where: { destination: m.walletAddress }, data: { syncedAt: new Date() } });
    await expireOverdue(prisma);
    expect((await prisma.webhookDelivery.findFirstOrThrow()).event).toBe("request.expired");
  });
});

describe("watcher health check", () => {
  it("does not alert while the worker is starting up", async () => {
    const messages: string[] = [];
    const health = new WatcherHealth(prisma, { alert: async (m) => void messages.push(m) });
    expect((await health.check()).healthy).toBe(true);
    expect(messages).toEqual([]);
  });

  it("alerts once when the heartbeat is stale and once when it recovers", async () => {
    const messages: string[] = [];
    const alerter: Alerter = { alert: async (m) => void messages.push(m) };
    const health = new WatcherHealth(prisma, alerter, Date.now() - 120_000);
    expect((await health.check()).healthy).toBe(false);
    await health.check();
    expect(messages).toEqual(["Watcher heartbeat is stale: no payments are being detected."]);
    await prisma.watcherHeartbeat.create({ data: { id: "watcher", beatAt: new Date(), streams: 0, connectedStreams: 0 } });
    expect((await health.check()).healthy).toBe(true);
    expect(messages).toHaveLength(2);
  });
});
