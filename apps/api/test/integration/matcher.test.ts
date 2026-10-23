import { beforeEach, describe, expect, it } from "vitest";
import { processOperation } from "../../src/engine/matcher";
import { failedResultXdr, randomAddress, randomHash } from "../helpers/fakes";
import { createMerchant, createRequest, op, prisma, resetDb } from "../helpers/harness";

const run = (o: ReturnType<typeof op>, merchantId: string, source: "watcher" | "verify" = "watcher") =>
  prisma.$transaction((tx) => processOperation(tx, o, merchantId, source));

const eventTypes = async (requestId: string) =>
  (await prisma.requestEvent.findMany({ where: { requestId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })).map((e) => e.type);

beforeEach(resetDb);

describe("processOperation", () => {
  it("a correct payment marks the request PAID with its hash and ledger time", async () => {
    const m = await createMerchant();
    const req = await createRequest(m, { amount: "50" });
    const closedAt = new Date(Date.now() - 1000);
    const o = op({ to: m.walletAddress, amount: "50", memo: req.reference, closedAt });
    const res = await run(o, m.id);
    expect(res).toMatchObject({ inserted: true, result: "MATCHED" });
    const after = await prisma.paymentRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(after.status).toBe("PAID");
    expect(after.paidTxHash).toBe(o.txHash);
    expect(after.paidAt?.toISOString()).toBe(new Date(Math.floor(closedAt.getTime() / 1000) * 1000).toISOString());
    expect(await eventTypes(req.id)).toEqual(["PAYMENT_SEEN", "PAID"]);
  });

  it("the same (txHash, opId) processed twice is recorded once and logged as a duplicate", async () => {
    const m = await createMerchant();
    const req = await createRequest(m);
    const o = op({ to: m.walletAddress, amount: "50", memo: req.reference });
    const first = await run(o, m.id);
    const second = await run(o, m.id, "verify");
    expect(first.inserted).toBe(true);
    expect(second).toMatchObject({ inserted: false, result: "MATCHED" });
    expect(await prisma.incomingPayment.count()).toBe(1);
    expect(await eventTypes(req.id)).toEqual(["PAYMENT_SEEN", "PAID", "DUPLICATE_IGNORED"]);
  });

  it("the same operation arriving concurrently from two paths is still recorded once", async () => {
    const m = await createMerchant();
    const req = await createRequest(m);
    const o = op({ to: m.walletAddress, amount: "50", memo: req.reference });
    const results = await Promise.all([run(o, m.id, "watcher"), run(o, m.id, "verify")]);
    expect(results.filter((r) => r.inserted)).toHaveLength(1);
    expect(await prisma.incomingPayment.count()).toBe(1);
    expect((await prisma.paymentRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("PAID");
  });

  it("two different payments racing for one request: exactly one MATCHED, the other ALREADY_PAID", async () => {
    const m = await createMerchant();
    const req = await createRequest(m);
    const a = op({ to: m.walletAddress, amount: "50", memo: req.reference });
    const b = op({ to: m.walletAddress, amount: "50", memo: req.reference });
    const results = await Promise.all([run(a, m.id), run(b, m.id)]);
    expect(results.map((r) => r.result).sort()).toEqual(["ALREADY_PAID", "MATCHED"]);
    const after = await prisma.paymentRequest.findUniqueOrThrow({ where: { id: req.id } });
    const winner = results.find((r) => r.result === "MATCHED");
    expect(after.paidTxHash).toBe(winner?.payment.txHash);
    expect((await eventTypes(req.id)).filter((t) => t === "PAID")).toHaveLength(1);
  });

  it("a second payment to an already-paid reference is ALREADY_PAID and flagged on the request", async () => {
    const m = await createMerchant();
    const req = await createRequest(m);
    await run(op({ to: m.walletAddress, amount: "50", memo: req.reference }), m.id);
    const second = await run(op({ to: m.walletAddress, amount: "50", memo: req.reference }), m.id);
    expect(second.result).toBe("ALREADY_PAID");
    expect(second.payment.requestId).toBe(req.id);
    expect((await eventTypes(req.id)).slice(-2)).toEqual(["PAYMENT_SEEN", "FLAGGED"]);
  });

  it("a failed transaction moves PENDING to FAILED with the result codes, and a retry pays it", async () => {
    const m = await createMerchant();
    const req = await createRequest(m);
    const failed = await run(
      op({ to: m.walletAddress, amount: "50", memo: req.reference, successful: false, resultXdr: failedResultXdr() }),
      m.id,
    );
    expect(failed.result).toBe("FAILED_TX");
    let after = await prisma.paymentRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(after.status).toBe("FAILED");
    expect(after.failedReason).toBe("Transaction failed on Stellar (tx_failed: op_underfunded)");
    expect(failed.payment.resultCodes).toEqual({ transaction: "tx_failed", operations: ["op_underfunded"] });

    const retry = await run(op({ to: m.walletAddress, amount: "50", memo: req.reference }), m.id);
    expect(retry.result).toBe("MATCHED");
    after = await prisma.paymentRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(after).toMatchObject({ status: "PAID", failedReason: null });
  });

  it("a wrong amount is flagged and the request stays PENDING", async () => {
    const m = await createMerchant();
    const req = await createRequest(m, { amount: "50" });
    const res = await run(op({ to: m.walletAddress, amount: "45", memo: req.reference }), m.id);
    expect(res.result).toBe("WRONG_AMOUNT");
    expect(res.payment.reason).toMatch(/Underpaid by 5\.0000000 USDC/);
    expect((await prisma.paymentRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("PENDING");
  });

  it("a payment with no memo is UNMATCHED and belongs to no request", async () => {
    const m = await createMerchant();
    await createRequest(m);
    const res = await run(op({ to: m.walletAddress, amount: "50", memo: null }), m.id);
    expect(res.result).toBe("UNMATCHED");
    expect(res.payment.requestId).toBeNull();
    expect(res.payment.merchantId).toBe(m.id);
  });

  it("another merchant's reference is UNMATCHED for this merchant and leaves that request alone", async () => {
    const a = await createMerchant();
    const b = await createMerchant();
    const reqB = await createRequest(b);
    const res = await run(op({ to: a.walletAddress, amount: "50", memo: reqB.reference }), a.id);
    expect(res.result).toBe("UNMATCHED");
    expect((await prisma.paymentRequest.findUniqueOrThrow({ where: { id: reqB.id } })).status).toBe("PENDING");
    expect(await eventTypes(reqB.id)).toEqual([]);
  });

  it("a payment after expiresAt is LATE and does not pay the request", async () => {
    const m = await createMerchant();
    const req = await createRequest(m, { expiresAt: new Date(Date.now() - 60_000) });
    const res = await run(op({ to: m.walletAddress, amount: "50", memo: req.reference, closedAt: new Date() }), m.id);
    expect(res.result).toBe("LATE");
    expect((await prisma.paymentRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("PENDING");
  });

  it("queues status webhooks in the same transaction: request.paid and payment.unmatched", async () => {
    const m = await createMerchant();
    await prisma.merchant.update({
      where: { id: m.id },
      data: { webhookUrl: "https://example.com/hook", webhookEvents: ["request.paid", "payment.unmatched"] },
    });
    const req = await createRequest(m);
    await run(op({ to: m.walletAddress, amount: "50", memo: req.reference }), m.id);
    await run(op({ to: m.walletAddress, amount: "3", memo: "hello" }), m.id);
    await run(op({ to: m.walletAddress, amount: "50", memo: req.reference }), m.id); // ALREADY_PAID: no webhook
    const deliveries = await prisma.webhookDelivery.findMany({ orderBy: { createdAt: "asc" } });
    expect(deliveries.map((d) => d.event)).toEqual(["request.paid", "payment.unmatched"]);
    const payload = deliveries[0]?.payload as { type: string; data: { request: { reference: string; status: string } } };
    expect(payload.data.request).toMatchObject({ reference: req.reference, status: "PAID" });
  });

  it("does not queue webhooks the merchant did not subscribe to", async () => {
    const m = await createMerchant();
    await prisma.merchant.update({ where: { id: m.id }, data: { webhookUrl: "https://example.com/hook", webhookEvents: [] } });
    const req = await createRequest(m);
    await run(op({ to: m.walletAddress, amount: "50", memo: req.reference }), m.id);
    expect(await prisma.webhookDelivery.count()).toBe(0);
  });

  it("a transaction that already paid another request can't pay a second one (no aborted transaction)", async () => {
    const m = await createMerchant();
    const a = await createRequest(m);
    const b = await createRequest(m);
    const txHash = randomHash();
    await prisma.paymentRequest.updateMany({ where: { id: b.id }, data: { status: "PAID", paidTxHash: txHash } }); // eslint-disable-line no-restricted-syntax -- test setup
    const res = await run(op({ to: m.walletAddress, amount: "50", memo: a.reference, txHash }), m.id);
    expect(res.result).toBe("ALREADY_PAID");
    expect((await prisma.paymentRequest.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("PENDING");
  });

  it("stores every field of the operation", async () => {
    const m = await createMerchant();
    const from = randomAddress();
    const txHash = randomHash();
    const res = await run(op({ to: m.walletAddress, from, amount: "1.5", memo: "x", txHash, asset: "XLM" }), m.id);
    expect(res.payment).toMatchObject({
      txHash,
      fromAddress: from,
      toAddress: m.walletAddress,
      assetCode: "XLM",
      assetIssuer: null,
      amount: "1.5000000",
      amountStroops: 15_000_000n,
      memo: "x",
      memoType: "text",
      txSuccessful: true,
      result: "UNMATCHED",
      source: "watcher",
    });
  });
});
