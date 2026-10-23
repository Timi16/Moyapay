import type { Merchant, PaymentRequest } from "@prisma/client";
import { Keypair } from "@stellar/stellar-sdk";
import pino from "pino";
import request from "supertest";
import type TestAgent from "supertest/lib/agent";
import { buildApp } from "../../src/app";
import { CHANNELS, PgListener } from "../../src/db/notify";
import { prisma } from "../../src/db/prisma";
import type { Limits } from "../../src/deps";
import { decodePaymentRecord, isSkip } from "../../src/engine/decode";
import type { IncomingOp } from "../../src/engine/types";
import { formatStroops, parseAmount } from "../../src/lib/amount";
import { generateReference } from "../../src/lib/ids";
import { LiveHub } from "../../src/modules/stream/hub";
import { FakeHorizon, paymentRecord, type PaymentInput } from "./fakes";
import { TEST_WEB_ORIGIN, USDC_ISSUER } from "./setupEnv";

export { prisma };
export const ORIGIN = TEST_WEB_ORIGIN;
export const API = "/api/v1";
export const silentLogger = pino({ level: "silent" });

const NO_LIMITS: Partial<Limits> = {
  authPerMin: 10_000,
  publicPerMin: 10_000,
  publicVerifyPerMin: 10_000,
  v1PerMin: 10_000,
  v1PerIpPerMin: 10_000,
};

export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "WebhookDelivery", "RequestEvent", "IncomingPayment", "PaymentRequest", "WatcherCursor", "WatcherHeartbeat", "ApiKey", "Session", "AuthChallenge", "RateLimit", "Merchant" CASCADE',
  );
}

export function makeApp(limits: Partial<Limits> = {}) {
  const horizon = new FakeHorizon();
  const hub = new LiveHub(prisma, silentLogger);
  const built = buildApp({
    prisma,
    horizon,
    hub,
    logger: silentLogger,
    allowInsecureWebhooks: true,
    limits: { ...NO_LIMITS, ...limits },
  });
  return { ...built, horizon, hub };
}
export type TestApp = ReturnType<typeof makeApp>;

/** Connects the hub to real Postgres NOTIFY, as server.ts does. Remember to stop it. */
export async function startListener(hub: LiveHub): Promise<PgListener> {
  const listener = new PgListener({
    connectionString: process.env.DATABASE_URL as string,
    channels: [CHANNELS.requestUpdated, CHANNELS.paymentRecorded],
    onNotification: hub.handleNotification,
    onConnect: hub.resync,
    logger: silentLogger,
  });
  await listener.start();
  return listener;
}

export interface SignedIn {
  agent: TestAgent;
  keypair: Keypair;
  merchant: { id: string; name: string; walletAddress: string };
}

/** Signs in through the real challenge flow with a fresh wallet (SEP-53 message signature). */
export async function signIn(t: TestApp, opts: { keypair?: Keypair; name?: string; viaTransaction?: boolean } = {}): Promise<SignedIn> {
  const keypair = opts.keypair ?? Keypair.random();
  const agent = request.agent(t.app);
  const challenge = await agent
    .post(`${API}/auth/challenge`)
    .set("Origin", ORIGIN)
    .send({ address: keypair.publicKey() })
    .expect(201);
  const body = challenge.body as { challengeId: string; message: string; transaction: string };
  let proof: Record<string, string>;
  if (opts.viaTransaction) {
    const { TransactionBuilder, Networks } = await import("@stellar/stellar-sdk");
    const tx = TransactionBuilder.fromXDR(body.transaction, Networks.TESTNET);
    tx.sign(keypair);
    proof = { signedTransaction: tx.toXDR() };
  } else {
    proof = { signature: Buffer.from(keypair.signMessage(body.message)).toString("base64") };
  }
  const verified = await agent
    .post(`${API}/auth/verify`)
    .set("Origin", ORIGIN)
    .send({ challengeId: body.challengeId, ...proof, ...(opts.name ? { name: opts.name } : {}) });
  if (verified.status >= 300) throw new Error(`sign-in failed: ${verified.status} ${JSON.stringify(verified.body)}`);
  return { agent, keypair, merchant: (verified.body as { merchant: SignedIn["merchant"] }).merchant };
}

/** A merchant created straight in the database, with its wallet watched (for engine tests). */
export async function createMerchant(address = Keypair.random().publicKey(), name = "Test shop"): Promise<Merchant> {
  const merchant = await prisma.merchant.create({ data: { name, walletAddress: address } });
  await prisma.watcherCursor.create({
    data: { destination: address, merchantId: merchant.id, pagingToken: null, watchFrom: new Date(Date.now() - 3600_000) },
  });
  return merchant;
}

/** A PENDING request created straight in the database (for engine tests). */
export async function createRequest(
  merchant: Merchant,
  opts: { amount?: string; destination?: string; expiresAt?: Date | null } = {},
): Promise<PaymentRequest> {
  const stroops = parseAmount(opts.amount ?? "50") ?? 0n;
  return prisma.paymentRequest.create({
    data: {
      merchantId: merchant.id,
      reference: generateReference(),
      destination: opts.destination ?? merchant.walletAddress,
      assetCode: "USDC",
      assetIssuer: USDC_ISSUER,
      amount: formatStroops(stroops),
      amountStroops: stroops,
      expiresAt: opts.expiresAt === undefined ? new Date(Date.now() + 3600_000) : opts.expiresAt,
      createdVia: "api",
    },
  });
}

/** An IncomingOp exactly as the watcher would decode it from Horizon. */
export function op(input: PaymentInput): IncomingOp {
  const decoded = decodePaymentRecord(paymentRecord(input), input.to);
  if (isSkip(decoded)) throw new Error(`not an incoming payment: ${decoded.skip}`);
  return decoded;
}

export async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 25));
  }
}

export { FakeHorizon, paymentRecord };
