/**
 * Testnet end-to-end proof (build plan, Step 8):   pnpm e2e
 *
 * Real Stellar Testnet transactions only. Creates (or reuses) one merchant wallet and three
 * payer wallets with Friendbot, adds USDC trustlines, gets test USDC, signs the merchant in,
 * creates requests through the API with an API key, pays them from the payer wallets and
 * asserts every outcome through the API. Results go to docs/PROOF.md.
 *
 * Needs: Postgres with migrations applied and the repo-root .env (see README). By default it
 * starts its own API and worker so it can restart the worker from an old cursor; set
 * E2E_API_URL to use a stack that is already running (the restart check is then skipped).
 *
 * The four wallets' secret keys are kept in .e2e-wallets.json at the repo root so later runs
 * reuse funded accounts. That file is gitignored: testnet only, never commit it.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { Asset, BASE_FEE, Horizon, Keypair, Memo, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

const ROOT = resolve(__dirname, "../../..");
const API_DIR = resolve(__dirname, "..");
const WALLETS_FILE = resolve(ROOT, ".e2e-wallets.json");
const PROOF_FILE = resolve(ROOT, "docs/PROOF.md");
const HORIZON_URL = process.env.HORIZON_URL ?? "https://horizon-testnet.stellar.org";
const PASSPHRASE = Networks.TESTNET;
const USDC_ISSUER = process.env.USDC_ISSUER ?? "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const USDC = new Asset("USDC", USDC_ISSUER);
const PORT = process.env.PORT ?? "4200";
const EXTERNAL = process.env.E2E_API_URL;
const API = `${EXTERNAL ?? `http://127.0.0.1:${PORT}`}/api/v1`;
const ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const USDC_PER_PAYER = "8";

if (process.env.NETWORK_PASSPHRASE && process.env.NETWORK_PASSPHRASE !== PASSPHRASE) {
  throw new Error("e2e runs on Stellar Testnet only");
}

const horizon = new Horizon.Server(HORIZON_URL);
const prisma = new PrismaClient();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;
const log = (msg: string) => console.log(`[e2e ${new Date().toISOString().slice(11, 19)}] ${msg}`);

// ---------------------------------------------------------------------------------------------
// Wallets

interface Wallets {
  merchant: string;
  payers: string[];
}

function loadWallets(): { merchant: Keypair; payers: Keypair[] } {
  let w: Wallets;
  if (existsSync(WALLETS_FILE)) {
    w = JSON.parse(readFileSync(WALLETS_FILE, "utf8")) as Wallets;
  } else {
    w = { merchant: Keypair.random().secret(), payers: [0, 1, 2].map(() => Keypair.random().secret()) };
    writeFileSync(WALLETS_FILE, JSON.stringify(w, null, 2), { mode: 0o600 });
    log(`created 4 new testnet wallets in .e2e-wallets.json (gitignored)`);
  }
  return { merchant: Keypair.fromSecret(w.merchant), payers: w.payers.map((s) => Keypair.fromSecret(s)) };
}

async function accountOrNull(address: string) {
  try {
    return await horizon.loadAccount(address);
  } catch (err) {
    if ((err as { response?: { status?: number } }).response?.status === 404) return null;
    throw err;
  }
}

async function friendbot(address: string): Promise<void> {
  if (await accountOrNull(address)) return;
  log(`funding ${short(address)} with Friendbot`);
  const res = await fetch(`https://friendbot.stellar.org?addr=${address}`);
  if (!res.ok) throw new Error(`Friendbot failed for ${address}: HTTP ${res.status}`);
}

function usdcBalance(account: Horizon.AccountResponse): string | null {
  for (const b of account.balances) {
    if ("asset_code" in b && b.asset_code === "USDC" && b.asset_issuer === USDC_ISSUER) return b.balance;
  }
  return null;
}

/** Decimal string comparison without floats: "8.5" >= "8". */
function gte(a: string, b: string): boolean {
  const scale = (v: string) => {
    const [w = "0", f = ""] = v.split(".");
    return BigInt(w) * 10_000_000n + BigInt(f.padEnd(7, "0").slice(0, 7));
  };
  return scale(a) >= scale(b);
}

async function submit(kp: Keypair, build: (b: TransactionBuilder) => TransactionBuilder, memo?: Memo) {
  const account = await horizon.loadAccount(kp.publicKey());
  let builder = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE }).setTimeout(120);
  if (memo) builder = builder.addMemo(memo);
  const tx = build(builder).build();
  tx.sign(kp);
  const hash = Buffer.from(tx.hash()).toString("hex");
  try {
    await horizon.submitTransaction(tx);
    return { hash, ok: true as const, codes: null };
  } catch (err) {
    const codes = (err as { response?: { data?: { extras?: { result_codes?: unknown } } } }).response?.data?.extras?.result_codes;
    return { hash, ok: false as const, codes };
  }
}

async function ensureTrustline(kp: Keypair): Promise<void> {
  const account = await horizon.loadAccount(kp.publicKey());
  if (usdcBalance(account) !== null) return;
  log(`adding the USDC trustline on ${short(kp.publicKey())}`);
  const res = await submit(kp, (b) => b.addOperation(Operation.changeTrust({ asset: USDC })));
  if (!res.ok) throw new Error(`changeTrust failed: ${JSON.stringify(res.codes)}`);
}

/** Buys test USDC with Friendbot XLM on the testnet DEX; falls back to the Circle faucet by hand. */
async function ensureUsdc(kp: Keypair): Promise<void> {
  const address = kp.publicKey();
  const balance = usdcBalance(await horizon.loadAccount(address)) ?? "0";
  if (gte(balance, USDC_PER_PAYER)) return;
  log(`buying ${USDC_PER_PAYER} test USDC for ${short(address)} on the testnet DEX`);
  const bought = await submit(kp, (b) =>
    b.addOperation(
      Operation.pathPaymentStrictReceive({
        sendAsset: Asset.native(),
        sendMax: "500",
        destination: address,
        destAsset: USDC,
        destAmount: USDC_PER_PAYER,
        path: [],
      }),
    ),
  );
  if (bought.ok) return;
  log(`the DEX could not sell USDC (${JSON.stringify(bought.codes)}).`);
  console.log(
    `\n  Get test USDC by hand: open https://faucet.circle.com, choose Stellar Testnet, and send USDC to\n    ${address}\n  Waiting for at least ${USDC_PER_PAYER} USDC to arrive…\n`,
  );
  for (;;) {
    await sleep(10_000);
    if (gte(usdcBalance(await horizon.loadAccount(address)) ?? "0", USDC_PER_PAYER)) return;
  }
}

// ---------------------------------------------------------------------------------------------
// Processes

const children: ChildProcess[] = [];

function startProcess(name: "api" | "worker"): ChildProcess {
  mkdirSync(resolve(API_DIR, ".e2e-logs"), { recursive: true });
  const out = createWriteStream(resolve(API_DIR, `.e2e-logs/${name}.log`), { flags: "a" });
  const child = spawn("npx", ["tsx", name === "api" ? "src/server.ts" : "src/worker.ts"], {
    cwd: API_DIR,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.pipe(out);
  child.stderr?.pipe(out);
  children.push(child);
  return child;
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  const exited = new Promise<void>((r) => child.once("exit", () => r()));
  child.kill("SIGTERM");
  await Promise.race([exited, sleep(30_000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function waitHealthy(): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      // Through /api/v1 so it also works via the web app's proxy (E2E_API_URL=http://localhost:3100).
      if ((await fetch(`${API}/public/status`)).ok) return;
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  throw new Error("API did not become healthy; see apps/api/.e2e-logs/api.log");
}

// ---------------------------------------------------------------------------------------------
// API client

let apiKey = "";

async function call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : null) as T;
}

/** Wallet sign-in (SEP-53), then an API key for everything else. */
async function signInAndGetKey(merchant: Keypair): Promise<string> {
  const ch = await call<{ challengeId: string; message: string }>(
    "POST",
    "/auth/challenge",
    { address: merchant.publicKey() },
    { origin: ORIGIN },
  );
  const signature = Buffer.from(merchant.signMessage(ch.message)).toString("base64");
  const res = await fetch(`${API}/auth/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ challengeId: ch.challengeId, signature, name: "MoyaPay e2e store" }),
  });
  if (!res.ok) throw new Error(`sign-in failed: ${res.status} ${await res.text()}`);
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const key = await call<{ key: string }>("POST", "/api-keys", { name: `e2e ${new Date().toISOString()}` }, { cookie, origin: ORIGIN });
  return key.key;
}

interface Req {
  reference: string;
  status: string;
  amount: string;
  destination: string;
  paidTxHash: string | null;
  failedReason: string | null;
  events?: { type: string }[];
}
interface Payment {
  txHash: string;
  result: string;
  reason: string;
  requestRef: string | null;
}

const createRequest = (amount: string, description: string, expiresIn?: number) =>
  call<Req>("POST", "/payment-requests", { amount, description, ...(expiresIn ? { expiresIn } : {}) });
const getRequest = (ref: string) => call<Req>("GET", `/payment-requests/${ref}`);

async function waitFor<T>(what: string, fn: () => Promise<T | null>, timeoutMs = 90_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let v: T | null = null;
    try {
      v = await fn();
    } catch (err) {
      // A restart or a network blip is not a failure; only the deadline is.
      if (Date.now() > deadline) throw err;
    }
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await sleep(2000);
  }
}

const waitStatus = (ref: string, status: string, timeoutMs?: number) =>
  waitFor(`${ref} to be ${status}`, async () => {
    const r = await getRequest(ref);
    return r.status === status ? r : null;
  }, timeoutMs);

/** The watcher's record of a transaction (never calls verify: detection must be automatic). */
const waitPayment = (hash: string) =>
  waitFor(`the watcher to record ${short(hash)}`, async () => {
    const page = await call<{ data: Payment[] }>("GET", `/transactions?q=${hash}`);
    return page.data.find((p) => p.txHash === hash) ?? null;
  });

const pay = (payer: Keypair, destination: string, amount: string, memo: string | null, asset: Asset = USDC) =>
  submit(payer, (b) => b.addOperation(Operation.payment({ destination, asset, amount })), memo ? Memo.text(memo) : undefined);

// ---------------------------------------------------------------------------------------------
// Scenarios

interface Row {
  scenario: string;
  reference: string;
  payer: string;
  txHash: string;
  expected: string;
  actual: string;
  pass: boolean;
}
const rows: Row[] = [];

function record(row: Omit<Row, "pass">): void {
  const pass = row.actual === row.expected;
  rows.push({ ...row, pass });
  log(`${pass ? "PASS" : "FAIL"} ${row.scenario}: expected ${row.expected}, got ${row.actual}`);
}

async function main(): Promise<void> {
  const { merchant, payers } = loadWallets();
  const [A, B, C] = payers as [Keypair, Keypair, Keypair];
  const names = new Map([
    [A.publicKey(), "A"],
    [B.publicKey(), "B"],
    [C.publicKey(), "C"],
  ]);
  const label = (kp: Keypair) => `${names.get(kp.publicKey())} ${short(kp.publicKey())}`;

  log("1/4 wallets: Friendbot, USDC trustlines, test USDC");
  for (const kp of [merchant, ...payers]) await friendbot(kp.publicKey());
  await sleep(6000);
  for (const kp of [merchant, ...payers]) await ensureTrustline(kp);
  for (const kp of payers) await ensureUsdc(kp);

  log("2/4 starting MoyaPay");
  let worker: ChildProcess | null = null;
  if (!EXTERNAL) {
    startProcess("api");
    worker = startProcess("worker");
  }
  await waitHealthy();
  apiKey = await signInAndGetKey(merchant);
  const dest = merchant.publicKey();
  const runStart = new Date();
  const startCursor = (await prisma.watcherCursor.findUnique({ where: { destination: dest } }))?.pagingToken ?? null;
  await waitFor("the watcher to connect", async () => {
    const s = await call<{ streams: { connected: number } }>("GET", "/public/status");
    return s.streams.connected > 0 ? s : null;
  });

  log("3/4 scenarios");
  // 5+ correct payments across the three payer wallets, each detected by the watcher on its own.
  const correct: { req: Req; payer: Keypair; hash: string }[] = [];
  const order = [A, B, C, A, B, C];
  for (const [i, payer] of order.entries()) {
    const amount = `1.${i + 1}`;
    const req = await createRequest(amount, `Correct payment ${i + 1}`);
    const tx = await pay(payer, dest, amount, req.reference);
    if (!tx.ok) throw new Error(`payment failed: ${JSON.stringify(tx.codes)}`);
    correct.push({ req, payer, hash: tx.hash });
  }
  for (const [i, c] of correct.entries()) {
    const after = await waitStatus(c.req.reference, "PAID");
    record({
      scenario: `Correct payment ${i + 1}`,
      reference: c.req.reference,
      payer: label(c.payer),
      txHash: c.hash,
      expected: "PAID",
      actual: after.paidTxHash === c.hash ? after.status : `${after.status} (other hash)`,
    });
  }

  {
    const req = await createRequest("2", "Wrong amount (short)");
    const tx = await pay(B, dest, "1.5", req.reference);
    const p = await waitPayment(tx.hash);
    const after = await getRequest(req.reference);
    record({ scenario: "Wrong amount (short)", reference: req.reference, payer: label(B), txHash: tx.hash, expected: "WRONG_AMOUNT, request PENDING", actual: `${p.result}, request ${after.status}` });
  }
  {
    const req = await createRequest("1", "Wrong asset (XLM)");
    const tx = await pay(C, dest, "1", req.reference, Asset.native());
    const p = await waitPayment(tx.hash);
    record({ scenario: "Wrong asset (XLM)", reference: req.reference, payer: label(C), txHash: tx.hash, expected: "WRONG_ASSET", actual: p.result });
  }
  {
    const tx = await pay(A, dest, "0.75", null);
    const p = await waitPayment(tx.hash);
    record({ scenario: "No memo", reference: "(none)", payer: label(A), txHash: tx.hash, expected: "UNMATCHED", actual: p.result });
  }
  {
    const first = correct[0];
    if (!first) throw new Error("no correct payment");
    const tx = await pay(B, dest, first.req.amount, first.req.reference);
    const p = await waitPayment(tx.hash);
    const after = await getRequest(first.req.reference);
    record({ scenario: "Second payment to a paid reference", reference: first.req.reference, payer: label(B), txHash: tx.hash, expected: "ALREADY_PAID, still paid by the first", actual: `${p.result}, ${after.paidTxHash === first.hash ? "still paid by the first" : "paid hash changed"}` });
  }
  {
    const req = await createRequest("1", "Fails on-chain (underfunded)");
    const tx = await pay(C, dest, "1000000", req.reference);
    const p = await waitPayment(tx.hash);
    const after = await waitStatus(req.reference, "FAILED");
    record({ scenario: "Failing transaction (pays more than the payer holds)", reference: req.reference, payer: label(C), txHash: tx.hash, expected: "FAILED_TX, request FAILED", actual: `${p.result}, request ${after.status}` });
    const retry = await pay(C, dest, "1", req.reference);
    const paid = await waitStatus(req.reference, "PAID");
    record({ scenario: "Retry after the failure", reference: req.reference, payer: label(C), txHash: retry.hash, expected: "PAID", actual: paid.paidTxHash === retry.hash ? paid.status : `${paid.status} (other hash)` });
  }
  {
    const req = await createRequest("1", "Expires in 1 minute", 60);
    log(`waiting for ${req.reference} to expire (about 1-2 minutes)`);
    const expired = await waitStatus(req.reference, "EXPIRED", 5 * 60_000);
    const tx = await pay(A, dest, "1", req.reference);
    const p = await waitPayment(tx.hash);
    const after = await getRequest(req.reference);
    record({ scenario: "1-minute expiry, paid after it expired", reference: req.reference, payer: label(A), txHash: tx.hash, expected: "EXPIRED, then LATE", actual: `${expired.status}, then ${p.result}${after.status === "EXPIRED" ? "" : ` (request turned ${after.status})`}` });
  }

  if (worker) {
    log("restarting the watcher from the old cursor");
    const before = await call<{ counts: { all: number } }>("GET", "/transactions?limit=1");
    // Rewinding to this run's start replays this run's payments only (the wallets are reused).
    const linked = await prisma.incomingPayment.count({ where: { toAddress: dest, requestId: { not: null }, createdAt: { gte: runStart } } });
    const dupsBefore = await prisma.requestEvent.count({ where: { type: "DUPLICATE_IGNORED", request: { destination: dest } } });
    const paidBefore = await prisma.requestEvent.count({ where: { type: "PAID", request: { destination: dest } } });
    await stopProcess(worker);
    await prisma.watcherCursor.update({ where: { destination: dest }, data: { pagingToken: startCursor } });
    startProcess("worker"); // tracked in `children`, stopped at exit
    const dups = await waitFor(
      "the replay to be logged as duplicates",
      async () => {
        const n = await prisma.requestEvent.count({ where: { type: "DUPLICATE_IGNORED", request: { destination: dest } } });
        return n - dupsBefore >= linked ? n - dupsBefore : null;
      },
      180_000,
    );
    const after = await call<{ counts: { all: number } }>("GET", "/transactions?limit=1");
    const paidAfter = await prisma.requestEvent.count({ where: { type: "PAID", request: { destination: dest } } });
    const twice = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM (SELECT "requestId" FROM "RequestEvent" WHERE "type" = 'PAID' GROUP BY "requestId" HAVING COUNT(*) > 1) x`;
    record({
      scenario: "Watcher restarted from an old cursor",
      reference: "(all above)",
      payer: "-",
      txHash: "-",
      expected: "no request counted twice, duplicates logged",
      actual:
        after.counts.all === before.counts.all && paidAfter === paidBefore && (twice[0]?.n ?? 0n) === 0n && dups >= linked
          ? "no request counted twice, duplicates logged"
          : `records ${before.counts.all}->${after.counts.all}, PAID events ${paidBefore}->${paidAfter}, ${dups} duplicates`,
    });
  } else {
    log("E2E_API_URL is set: skipping the watcher restart check (it needs to control the worker)");
  }

  log("4/4 writing docs/PROOF.md");
  writeProof(merchant.publicKey(), payers.map((p) => p.publicKey()));
  const failed = rows.filter((r) => !r.pass);
  log(failed.length === 0 ? `all ${rows.length} checks passed` : `${failed.length} of ${rows.length} checks FAILED`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

function writeProof(merchant: string, payers: string[]): void {
  const link = (h: string) => (/^[0-9a-f]{64}$/.test(h) ? `[${h.slice(0, 10)}…](https://stellar.expert/explorer/testnet/tx/${h})` : h);
  const lines = [
    "# Testnet proof",
    "",
    `Generated by \`pnpm e2e\` (\`apps/api/scripts/e2e-testnet.ts\`) on ${new Date().toISOString()} against Stellar Testnet (${HORIZON_URL}).`,
    "Every row is a real transaction, detected by the watcher and checked through the MoyaPay API.",
    "",
    `- Merchant wallet: \`${merchant}\``,
    ...payers.map((p, i) => `- Payer ${"ABC"[i]}: \`${p}\``),
    `- Asset: USDC, issuer \`${USDC_ISSUER}\``,
    "",
    "| Scenario | Reference | Payer wallet | Tx hash | Stellar Expert | Expected | Actual |",
    "|---|---|---|---|---|---|---|",
    ...rows.map((r) => {
      const hash = /^[0-9a-f]{64}$/.test(r.txHash) ? `\`${r.txHash}\`` : r.txHash;
      return `| ${r.scenario} | ${r.reference} | ${r.payer} | ${hash} | ${link(r.txHash)} | ${r.expected} | ${r.pass ? "✅ " : "❌ "}${r.actual} |`;
    }),
    "",
    `Distinct payer wallets with correct payments: ${new Set(rows.filter((r) => r.scenario.startsWith("Correct")).map((r) => r.payer)).size}.`,
    "",
  ];
  writeFileSync(PROOF_FILE, lines.join("\n"));
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const c of children) await stopProcess(c);
    await prisma.$disconnect();
  });
