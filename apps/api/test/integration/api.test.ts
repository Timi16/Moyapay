import { Asset, Keypair, Memo, Networks, Operation, TransactionBuilder, Account } from "@stellar/stellar-sdk";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Checkout, PaymentRequest, PaymentRequestDetail } from "@moyapay/shared";
import { REFERENCE_REGEX } from "@moyapay/shared";
import { failedResultXdr, randomAddress, randomHash } from "../helpers/fakes";
import {
  API,
  makeApp,
  ORIGIN,
  paymentRecord,
  prisma,
  resetDb,
  signIn,
  startListener,
  waitFor,
  type SignedIn,
  type TestApp,
} from "../helpers/harness";
import { USDC_ISSUER } from "../helpers/setupEnv";

let t: TestApp;
let me: SignedIn;

beforeEach(async () => {
  await resetDb();
  t = makeApp();
  me = await signIn(t, { name: "Kemi's Kitchen" });
});

const post = (path: string, body: unknown = {}) => me.agent.post(`${API}${path}`).set("Origin", ORIGIN).send(body as object);
const get = (path: string) => me.agent.get(`${API}${path}`);

async function createReq(body: Record<string, unknown> = { amount: "50" }): Promise<PaymentRequest> {
  const res = await post("/payment-requests", body).expect(201);
  return res.body as PaymentRequest;
}

/** Puts a payment on the fake chain and returns its hash. */
function pay(to: string, amount: string, memo: string | null, extra: Parameters<typeof paymentRecord>[0] extends infer P ? Partial<P> : never = {}) {
  return t.horizon.addPayment(paymentRecord({ to, amount, memo, ...extra })).transaction_hash;
}

describe("wallet sign-in", () => {
  it("creates the merchant on first sign-in, sets an httpOnly cookie and watches the wallet", async () => {
    const kp = Keypair.random();
    const agent = request.agent(t.app);
    const ch = await agent.post(`${API}/auth/challenge`).set("Origin", ORIGIN).send({ address: kp.publicKey() }).expect(201);
    expect(ch.body.message).toContain(kp.publicKey());
    const sig = Buffer.from(kp.signMessage(ch.body.message as string)).toString("base64");
    const res = await agent
      .post(`${API}/auth/verify`)
      .set("Origin", ORIGIN)
      .send({ challengeId: ch.body.challengeId, signature: sig })
      .expect(201);
    expect(res.body).toMatchObject({ created: true, merchant: { walletAddress: kp.publicKey() } });
    expect(String(res.headers["set-cookie"])).toMatch(/mp_session=.*HttpOnly/);
    await agent.get(`${API}/auth/me`).expect(200);
    expect(await prisma.watcherCursor.findUnique({ where: { destination: kp.publicKey() } })).not.toBeNull();
  });

  it("accepts a signed challenge transaction (wallets that cannot sign messages)", async () => {
    const s = await signIn(t, { viaTransaction: true });
    await s.agent.get(`${API}/auth/me`).expect(200);
  });

  it("signing in again with the same wallet returns the same merchant", async () => {
    const again = await signIn(t, { keypair: me.keypair });
    expect(again.merchant.id).toBe(me.merchant.id);
    expect(again.merchant.name).toBe("Kemi's Kitchen");
  });

  it("rejects a signature from another wallet, and a challenge used twice", async () => {
    const kp = Keypair.random();
    const agent = request.agent(t.app);
    const ch = await agent.post(`${API}/auth/challenge`).set("Origin", ORIGIN).send({ address: kp.publicKey() });
    const wrong = Buffer.from(Keypair.random().signMessage(ch.body.message as string)).toString("base64");
    const bad = await agent.post(`${API}/auth/verify`).set("Origin", ORIGIN).send({ challengeId: ch.body.challengeId, signature: wrong });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("INVALID_SIGNATURE");

    const good = Buffer.from(kp.signMessage(ch.body.message as string)).toString("base64");
    await agent.post(`${API}/auth/verify`).set("Origin", ORIGIN).send({ challengeId: ch.body.challengeId, signature: good }).expect(201);
    const reuse = await agent.post(`${API}/auth/verify`).set("Origin", ORIGIN).send({ challengeId: ch.body.challengeId, signature: good });
    expect(reuse.body.error.code).toBe("CHALLENGE_EXPIRED");
  });

  it("rejects an invalid address", async () => {
    const res = await request(t.app).post(`${API}/auth/challenge`).set("Origin", ORIGIN).send({ address: "GABC" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "VALIDATION_FAILED", message: expect.any(String) } });
  });

  it("logout ends the session", async () => {
    await post("/auth/logout").expect(204);
    await get("/auth/me").expect(401);
  });

  it("refuses state-changing dashboard calls from another origin (CSRF)", async () => {
    const res = await me.agent.post(`${API}/payment-requests`).set("Origin", "https://evil.example").send({ amount: "1" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN_ORIGIN");
  });

  it("renames the merchant", async () => {
    const res = await me.agent.patch(`${API}/auth/me`).set("Origin", ORIGIN).send({ name: "Kemi & Co" }).expect(200);
    expect(res.body.merchant.name).toBe("Kemi & Co");
  });
});

describe("payment requests", () => {
  it("creates a USDC request to the merchant's wallet with a unique reference", async () => {
    const req = await createReq({ amount: "50", description: "Jollof x2" });
    expect(req.reference).toMatch(REFERENCE_REGEX);
    expect(req).toMatchObject({
      status: "PENDING",
      amount: "50.0000000",
      asset: { code: "USDC", issuer: USDC_ISSUER },
      destination: me.merchant.walletAddress,
      description: "Jollof x2",
      payUrl: `${ORIGIN}/pay/${req.reference}`,
      createdVia: "dashboard",
    });
    const expires = new Date(req.expiresAt ?? 0).getTime();
    expect(Math.abs(expires - (Date.now() + 86_400_000))).toBeLessThan(10_000);
  });

  it("supports never-expiring and 1-minute requests", async () => {
    expect((await createReq({ amount: "1", expiresIn: null })).expiresAt).toBeNull();
    const short = await createReq({ amount: "1", expiresIn: 60 });
    expect(new Date(short.expiresAt ?? 0).getTime() - Date.now()).toBeLessThan(61_000);
  });

  it.each([
    [{ amount: 50 }, "Amount must be a decimal string"],
    [{ amount: "0" }, "greater than 0"],
    [{ amount: "1.00000001" }, "at most 7 decimals"],
    [{ amount: "1", expiresIn: 10 }, "at least 60"],
    [{ amount: "1", asset: "XLM" }, "Unrecognized key"],
  ])("validates %j", async (body, message) => {
    const res = await post("/payment-requests", body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.error.message).toContain(message);
  });

  it("checks the destination can receive USDC", async () => {
    const noTrust = randomAddress();
    t.horizon.accounts.set(noTrust, { exists: true, trustlines: [] });
    const unfunded = randomAddress();
    t.horizon.accounts.set(unfunded, { exists: false });
    expect((await post("/payment-requests", { amount: "1", destination: noTrust })).body.error.code).toBe("NO_TRUSTLINE");
    expect((await post("/payment-requests", { amount: "1", destination: unfunded })).body.error.code).toBe("ACCOUNT_NOT_FOUND");
    t.horizon.unreachable = true;
    const down = await post("/payment-requests", { amount: "1" });
    expect(down.status).toBe(503);
    expect(down.body.error.code).toBe("HORIZON_UNAVAILABLE");
  });

  it("a wallet's owner who signs in takes the address back from a merchant that only named it", async () => {
    const owner = Keypair.random();
    await createReq({ amount: "5", destination: owner.publicKey() });
    expect((await prisma.watcherCursor.findUniqueOrThrow({ where: { destination: owner.publicKey() } })).merchantId).toBe(me.merchant.id);
    const signedIn = await signIn(t, { keypair: owner });
    expect((await prisma.watcherCursor.findUniqueOrThrow({ where: { destination: owner.publicKey() } })).merchantId).toBe(signedIn.merchant.id);
    const res = await post("/payment-requests", { amount: "1", destination: owner.publicKey() });
    expect(res.body.error.code).toBe("DESTINATION_CLAIMED");
  });

  it("accepts a custom destination and starts watching it; another merchant's wallet is refused", async () => {
    const custom = randomAddress();
    const req = await createReq({ amount: "5", destination: custom });
    expect(req.destination).toBe(custom);
    expect((await prisma.watcherCursor.findUniqueOrThrow({ where: { destination: custom } })).merchantId).toBe(me.merchant.id);

    const other = await signIn(t);
    const res = await post("/payment-requests", { amount: "1", destination: other.merchant.walletAddress });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DESTINATION_CLAIMED");
  });

  it("lists with status counts, status filter, search by reference and hash, and pagination", async () => {
    const a = await createReq({ amount: "1" });
    const b = await createReq({ amount: "2" });
    await createReq({ amount: "3" });
    const hash = pay(me.merchant.walletAddress, "2", b.reference);
    await post(`/payment-requests/${b.reference}/verify`, { txHash: hash }).expect(200);

    const all = await get("/payment-requests?limit=2").expect(200);
    expect(all.body.data).toHaveLength(2);
    expect(all.body.counts).toMatchObject({ ALL: 3, PENDING: 2, PAID: 1, FAILED: 0, EXPIRED: 0 });
    const page2 = await get(`/payment-requests?limit=2&cursor=${all.body.nextCursor as string}`).expect(200);
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.nextCursor).toBeNull();

    expect((await get("/payment-requests?status=PAID").expect(200)).body.data[0].reference).toBe(b.reference);
    expect((await get(`/payment-requests?q=${a.reference.slice(3).toLowerCase()}`).expect(200)).body.data[0].reference).toBe(a.reference);
    expect((await get(`/payment-requests?q=${hash.slice(0, 10)}`).expect(200)).body.data[0].reference).toBe(b.reference);
  });

  it("exports CSV", async () => {
    const req = await createReq({ amount: "7.5", description: "=cmd" });
    const res = await get("/payment-requests?format=csv").expect(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text.split("\r\n")[0]).toBe("reference,description,amount,asset,status,destination,created_at,expires_at,paid_at,paid_tx_hash,failed_reason");
    expect(res.text).toContain(`${req.reference},'=cmd,7.5000000,USDC,PENDING`);
  });

  it("shows the detail with the timeline, the payment and the five checks", async () => {
    const req = await createReq({ amount: "50" });
    const hash = pay(me.merchant.walletAddress, "50", req.reference);
    await post(`/payment-requests/${req.reference}/verify`, { txHash: hash }).expect(200);
    const d = (await get(`/payment-requests/${req.reference}`).expect(200)).body as PaymentRequestDetail;
    expect(d.status).toBe("PAID");
    expect(d.paidTxHash).toBe(hash);
    expect(d.events.map((e) => e.type)).toEqual(["CREATED", "PAYMENT_SEEN", "PAID"]);
    expect(d.payments[0]).toMatchObject({ txHash: hash, result: "MATCHED", explorerUrl: `https://stellar.expert/explorer/testnet/tx/${hash}` });
    expect(d.verification?.checks.map((c) => [c.key, c.ok])).toEqual([
      ["wallet", true],
      ["asset", true],
      ["amount", true],
      ["reference", true],
      ["tx_success", true],
    ]);
  });

  it("a memo typed without the dash still passes the reference check", async () => {
    const req = await createReq({ amount: "50" });
    const hash = pay(me.merchant.walletAddress, "50", req.reference.replace("-", "").toLowerCase());
    await post(`/payment-requests/${req.reference}/verify`, { txHash: hash }).expect(200);
    const d = (await get(`/payment-requests/${req.reference}`)).body as PaymentRequestDetail;
    expect(d.status).toBe("PAID");
    expect(d.verification?.checks.every((c) => c.ok)).toBe(true);
  });

  it("another merchant's request is not found", async () => {
    const req = await createReq();
    const other = await signIn(t);
    await other.agent.get(`${API}/payment-requests/${req.reference}`).expect(404);
  });
});

describe("verify by hash", () => {
  it("runs the matcher; calling it again is a logged duplicate, not a second payment", async () => {
    const req = await createReq({ amount: "50" });
    const hash = pay(me.merchant.walletAddress, "50", req.reference);
    const first = await post(`/payment-requests/${req.reference}/verify`, { txHash: hash }).expect(200);
    expect(first.body.request.status).toBe("PAID");
    expect(first.body.payments[0]).toMatchObject({ result: "MATCHED", alreadyRecorded: false, source: "verify" });
    const again = await post(`/payment-requests/${req.reference}/verify`, { txHash: hash.toUpperCase() }).expect(200);
    expect(again.body.payments[0].alreadyRecorded).toBe(true);
    expect(await prisma.incomingPayment.count()).toBe(1);
    expect(again.body.request.events.map((e: { type: string }) => e.type)).toContain("DUPLICATE_IGNORED");
  });

  it("ignores payments from before the address was watched (public verify can't import old history)", async () => {
    const req = await createReq({ amount: "50" });
    const old = pay(me.merchant.walletAddress, "50", req.reference, { closedAt: new Date(Date.now() - 86_400_000) });
    const res = await request(t.app).post(`${API}/public/pay/${req.reference}/verify`).send({ txHash: old });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain("before MoyaPay started watching");
    expect(await prisma.incomingPayment.count()).toBe(0);
  });

  it("an unknown hash is TX_NOT_FOUND; a transaction that pays someone else is TX_NOT_RELEVANT", async () => {
    const req = await createReq();
    const missing = await post(`/payment-requests/${req.reference}/verify`, { txHash: randomHash() });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("TX_NOT_FOUND");
    const elsewhere = pay(randomAddress(), "50", req.reference);
    const res = await post(`/payment-requests/${req.reference}/verify`, { txHash: elsewhere });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("TX_NOT_RELEVANT");
  });

  it("records a failed transaction from its envelope when Horizon lists no operations for it", async () => {
    const req = await createReq({ amount: "50" });
    const payer = Keypair.random();
    const tx = new TransactionBuilder(new Account(payer.publicKey(), "100"), { fee: "100", networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.payment({ destination: me.merchant.walletAddress, asset: new Asset("USDC", USDC_ISSUER), amount: "50" }))
      .addMemo(Memo.text(req.reference))
      .setTimeout(300)
      .build();
    tx.sign(payer);
    const hash = Buffer.from(tx.hash()).toString("hex");
    t.horizon.txs.set(hash, {
      hash,
      successful: false,
      ledger: 777,
      created_at: new Date().toISOString(),
      memo_type: "text",
      memo: req.reference,
      result_xdr: failedResultXdr(),
      envelope_xdr: tx.toXDR(),
      paging_token: ((777n << 32n) | (1n << 12n)).toString(),
      source_account: payer.publicKey(),
    });
    const res = await post(`/payment-requests/${req.reference}/verify`, { txHash: hash }).expect(200);
    expect(res.body.request.status).toBe("FAILED");
    expect(res.body.request.failedReason).toContain("op_underfunded");
    expect(res.body.payments[0]).toMatchObject({ result: "FAILED_TX", from: payer.publicKey(), amount: "50.0000000" });
  });
});

describe("reconciliation (/transactions)", () => {
  it("lists every incoming payment with results, views and counts", async () => {
    const req = await createReq({ amount: "10" });
    const ok = pay(me.merchant.walletAddress, "10", req.reference);
    const short = pay(me.merchant.walletAddress, "9", req.reference);
    await post(`/payment-requests/${req.reference}/verify`, { txHash: ok });
    await post(`/payment-requests/${req.reference}/verify`, { txHash: short });
    const res = await get("/transactions").expect(200);
    expect(res.body.data.map((p: { result: string }) => p.result).sort()).toEqual(["ALREADY_PAID", "MATCHED"]);
    expect(res.body.counts).toMatchObject({ all: 2, matched: 1, needsReview: 1, seenToday: 2, duplicatesIgnored: 0 });
    expect((await get("/transactions?view=needs_review").expect(200)).body.data).toHaveLength(1);
    expect((await get("/transactions?result=MATCHED").expect(200)).body.data[0].requestRef).toBe(req.reference);
  });

  it("assigns an unmatched payment to a request, which marks it PAID", async () => {
    const req = await createReq({ amount: "12" });
    const other = await createReq({ amount: "1" });
    const hash = pay(me.merchant.walletAddress, "12", "order 991");
    await post(`/payment-requests/${other.reference}/verify`, { txHash: hash }).expect(200);
    const payment = await prisma.incomingPayment.findFirstOrThrow({ where: { txHash: hash } });
    expect(payment.result).toBe("UNMATCHED");

    const res = await me.agent
      .patch(`${API}/transactions/${payment.id}`)
      .set("Origin", ORIGIN)
      .send({ resolution: "ASSIGNED", requestRef: req.reference.toLowerCase(), note: "customer emailed" })
      .expect(200);
    expect(res.body).toMatchObject({ resolution: "ASSIGNED", requestRef: req.reference, request: { status: "PAID", paidTxHash: hash } });
    const detail = (await get(`/payment-requests/${req.reference}`)).body as PaymentRequestDetail;
    expect(detail.events.map((e) => e.type)).toEqual(["CREATED", "PAYMENT_SEEN", "PAID"]);
  });

  it("refuses to assign a payment of the wrong amount, and to refund a matched one", async () => {
    const req = await createReq({ amount: "12" });
    const hash = pay(me.merchant.walletAddress, "11", null);
    const matched = pay(me.merchant.walletAddress, "12", req.reference);
    // No memo: verify on any request at this address records it as UNMATCHED.
    await post(`/payment-requests/${req.reference}/verify`, { txHash: hash }).expect(200);
    const p = await prisma.incomingPayment.findFirstOrThrow({ where: { txHash: hash } });
    const bad = await me.agent
      .patch(`${API}/transactions/${p.id}`)
      .set("Origin", ORIGIN)
      .send({ resolution: "ASSIGNED", requestRef: req.reference });
    expect(bad.status).toBe(409);
    expect(bad.body.error).toMatchObject({ code: "PAYMENT_NOT_ASSIGNABLE", message: expect.stringContaining("11.0000000") });

    await post(`/payment-requests/${req.reference}/verify`, { txHash: matched }).expect(200);
    const m = await prisma.incomingPayment.findFirstOrThrow({ where: { txHash: matched } });
    const refund = await me.agent.patch(`${API}/transactions/${m.id}`).set("Origin", ORIGIN).send({ resolution: "REFUNDED" });
    expect(refund.status).toBe(409);
  });

  it("marks payments refunded or ignored, and reopens them", async () => {
    const req = await createReq({ amount: "12" });
    const hash = pay(me.merchant.walletAddress, "3", req.reference);
    await post(`/payment-requests/${req.reference}/verify`, { txHash: hash });
    const p = await prisma.incomingPayment.findFirstOrThrow({ where: { txHash: hash } });
    const patch = (body: object) => me.agent.patch(`${API}/transactions/${p.id}`).set("Origin", ORIGIN).send(body);
    expect((await patch({ resolution: "REFUNDED", note: "sent back" }).expect(200)).body).toMatchObject({ resolution: "REFUNDED", resolutionNote: "sent back" });
    expect((await get("/transactions?view=refunded")).body.data).toHaveLength(1);
    expect((await get("/transactions?view=needs_review")).body.data).toHaveLength(0);
    await patch({ resolution: "IGNORED" }).expect(200);
    expect((await get("/transactions?view=ignored")).body.data).toHaveLength(1);
    expect((await patch({ resolution: "NONE" }).expect(200)).body.resolution).toBe("NONE");
  });

  it("shows one payment with its linked request and checks, and exports CSV", async () => {
    const req = await createReq({ amount: "12" });
    const hash = pay(me.merchant.walletAddress, "12", req.reference);
    await post(`/payment-requests/${req.reference}/verify`, { txHash: hash });
    const p = await prisma.incomingPayment.findFirstOrThrow();
    const one = await get(`/transactions/${p.id}`).expect(200);
    expect(one.body.request.reference).toBe(req.reference);
    expect(one.body.checks).toHaveLength(5);
    const csv = await get("/transactions?format=csv").expect(200);
    expect(csv.text).toContain(`${hash},`);
    expect(csv.text).toContain(",MATCHED,");
  });

  it("another merchant's payment is not found", async () => {
    const req = await createReq({ amount: "12" });
    const hash = pay(me.merchant.walletAddress, "12", req.reference);
    await post(`/payment-requests/${req.reference}/verify`, { txHash: hash });
    const p = await prisma.incomingPayment.findFirstOrThrow();
    const other = await signIn(t);
    await other.agent.get(`${API}/transactions/${p.id}`).expect(404);
  });
});

describe("public checkout", () => {
  it("returns only what the payer needs, and records CHECKOUT_OPENED once", async () => {
    const req = await createReq({ amount: "50", description: "Jollof" });
    const res = await request(t.app).get(`${API}/public/pay/${req.reference}?opened=1`).expect(200);
    const c = res.body as Checkout;
    expect(c).toMatchObject({
      reference: req.reference,
      status: "PENDING",
      merchant: { name: "Kemi's Kitchen" },
      amount: "50.0000000",
      destination: me.merchant.walletAddress,
      memo: req.reference,
      lastPayment: null,
    });
    expect(JSON.stringify(c)).not.toContain(me.merchant.id);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    await request(t.app).get(`${API}/public/pay/${req.reference}?opened=1`).expect(200);
    expect(await prisma.requestEvent.count({ where: { type: "CHECKOUT_OPENED" } })).toBe(1);
  });

  it("verify from the checkout marks the request paid; a short payment shows in lastPayment", async () => {
    const req = await createReq({ amount: "50" });
    const short = pay(me.merchant.walletAddress, "20", req.reference);
    const res1 = await request(t.app).post(`${API}/public/pay/${req.reference}/verify`).send({ txHash: short }).expect(200);
    expect(res1.body).toMatchObject({ status: "PENDING", lastPayment: { result: "WRONG_AMOUNT", amount: "20.0000000" } });
    const ok = pay(me.merchant.walletAddress, "50", req.reference);
    const res2 = await request(t.app).post(`${API}/public/pay/${req.reference}/verify`).send({ txHash: ok }).expect(200);
    expect(res2.body).toMatchObject({ status: "PAID", paidTxHash: ok });
  });

  it("404s an unknown reference and 400s a malformed one", async () => {
    await request(t.app).get(`${API}/public/pay/MP-2222AB`).expect(404);
    await request(t.app).get(`${API}/public/pay/not-a-ref`).expect(400);
  });

  it("rate-limits verify", async () => {
    const limited = makeApp({ publicVerifyPerMin: 1 });
    await request(limited.app).post(`${API}/public/pay/MP-2222AB/verify`).send({ txHash: randomHash() });
    const res = await request(limited.app).post(`${API}/public/pay/MP-2222AB/verify`).send({ txHash: randomHash() });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(res.headers["retry-after"]).toBeDefined();
  });

  it("pushes the new status to live subscribers when the request is paid", async () => {
    const listener = await startListener(t.hub);
    try {
      const req = await createReq({ amount: "50" });
      const seen: string[] = [];
      t.hub.subscribePublic(req.reference, (c) => seen.push(c.status));
      const hash = pay(me.merchant.walletAddress, "50", req.reference);
      await request(t.app).post(`${API}/public/pay/${req.reference}/verify`).send({ txHash: hash }).expect(200);
      await waitFor(async () => seen.includes("PAID"));
    } finally {
      await listener.stop();
    }
  });

  it("exposes the watcher status", async () => {
    const res = await request(t.app).get(`${API}/public/status`).expect(200);
    expect(res.body).toMatchObject({ network: "testnet", healthy: false });
  });
});

describe("API keys", () => {
  it("are shown once, authenticate as Bearer, can be rolled and revoked", async () => {
    const created = await post("/api-keys", { name: "Server" }).expect(201);
    const key = created.body.key as string;
    expect(key).toMatch(/^mp_test_[A-Za-z0-9]{40}$/);
    expect(JSON.stringify((await get("/api-keys")).body)).not.toContain(key);

    const viaKey = await request(t.app).post(`${API}/payment-requests`).set("Authorization", `Bearer ${key}`).send({ amount: "3" }).expect(201);
    expect(viaKey.body.createdVia).toBe("api");
    // A key cannot manage keys or webhook secrets.
    await request(t.app).get(`${API}/api-keys`).set("Authorization", `Bearer ${key}`).expect(401);
    await request(t.app).get(`${API}/webhook`).set("Authorization", `Bearer ${key}`).expect(401);

    const rolled = await post(`/api-keys/${created.body.apiKey.id as string}/roll`).expect(201);
    await request(t.app).get(`${API}/payment-requests`).set("Authorization", `Bearer ${key}`).expect(401);
    await request(t.app).get(`${API}/payment-requests`).set("Authorization", `Bearer ${rolled.body.key as string}`).expect(200);

    await me.agent.delete(`${API}/api-keys/${rolled.body.apiKey.id as string}`).set("Origin", ORIGIN).expect(204);
    await request(t.app).get(`${API}/payment-requests`).set("Authorization", `Bearer ${rolled.body.key as string}`).expect(401);
  });

  it("stores only the hash", async () => {
    const created = await post("/api-keys", {}).expect(201);
    const row = await prisma.apiKey.findFirstOrThrow();
    expect(JSON.stringify(row)).not.toContain(created.body.key);
  });

  it("a bad Bearer key is 401 even with a valid session cookie", async () => {
    await me.agent.get(`${API}/payment-requests`).set("Authorization", "Bearer mp_test_nope").expect(401);
  });
});

describe("webhook settings", () => {
  it("saves the URL and events, reveals and rolls the secret, and queues a test", async () => {
    const saved = await me.agent
      .put(`${API}/webhook`)
      .set("Origin", ORIGIN)
      .send({ url: "http://127.0.0.1:9999/hook", events: ["request.paid"] })
      .expect(200);
    expect(saved.body).toMatchObject({ url: "http://127.0.0.1:9999/hook", events: ["request.paid"] });
    expect(saved.body.secret).toMatch(/^whsec_[0-9a-f]{48}$/);
    const rolled = await post("/webhook/roll-secret").expect(200);
    expect(rolled.body.secret).not.toBe(saved.body.secret);
    await post("/webhook/test").expect(202);
    expect((await get("/webhook/deliveries").expect(200)).body.data[0]).toMatchObject({ event: "ping", status: "PENDING" });
  });

  it("rejects a non-http URL", async () => {
    const res = await me.agent.put(`${API}/webhook`).set("Origin", ORIGIN).send({ url: "ftp://example.com/x" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("WEBHOOK_URL_REJECTED");
  });
});

describe("dashboard data", () => {
  it("summary: collected in 30 days with daily bars, paid, pending and needs-a-look counts", async () => {
    const a = await createReq({ amount: "10" });
    const b = await createReq({ amount: "2.5" });
    await createReq({ amount: "99" });
    for (const r of [a, b]) {
      const hash = pay(me.merchant.walletAddress, r.amount, r.reference);
      await post(`/payment-requests/${r.reference}/verify`, { txHash: hash }).expect(200);
    }
    const stray = pay(me.merchant.walletAddress, "1", null);
    await post(`/payment-requests/${a.reference}/verify`, { txHash: stray });
    const s = (await get("/summary").expect(200)).body;
    expect(s.collected30d.amount).toBe("12.5000000");
    expect(s.collected30d.daily).toHaveLength(30);
    expect(s.collected30d.daily.at(-1).amount).toBe("12.5000000");
    expect(s).toMatchObject({ paid30d: 2, pending: 1, pendingAmount: "99.0000000", needsReview: 1, needsReviewKinds: ["UNMATCHED"] });
  });

  it("activity: request events and stray payments, newest first", async () => {
    const r = await createReq({ amount: "10" });
    await post(`/payment-requests/${r.reference}/verify`, { txHash: pay(me.merchant.walletAddress, "10", r.reference) });
    const items = (await get("/activity?limit=10").expect(200)).body.data as { type: string; reference: string }[];
    expect(items.map((i) => i.type)).toEqual(["PAID", "CREATED"]);
  });

  it("account check: trustline present or missing", async () => {
    const res = await get(`/accounts/${me.merchant.walletAddress}`).expect(200);
    expect(res.body).toMatchObject({ exists: true, usdcTrustline: true, usdcBalance: "100.0000000" });
    const bare = randomAddress();
    t.horizon.accounts.set(bare, { exists: true, trustlines: [] });
    expect((await get(`/accounts/${bare}`)).body.usdcTrustline).toBe(false);
  });

  it("unknown routes are a JSON 404", async () => {
    const res = await get("/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

afterEach(() => {
  t.sse.closeAll();
});
