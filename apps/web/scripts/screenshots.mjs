// Takes the screenshots for docs/screenshots/ from a running stack, with real testnet data.
//   node scripts/screenshots.mjs            (WEB=http://localhost:3100 by default)
// Signs in as the merchant in .e2e-wallets.json (created by `pnpm e2e`), so run the e2e first.
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { Keypair } from "@stellar/stellar-sdk";
import { chromium } from "playwright-core";

const WEB = process.env.WEB ?? "http://localhost:3100";
const ROOT = resolve(import.meta.dirname, "../../..");
const OUT = resolve(ROOT, "docs/screenshots");
mkdirSync(OUT, { recursive: true });
const wallets = JSON.parse(readFileSync(resolve(ROOT, ".e2e-wallets.json"), "utf8"));
const merchant = Keypair.fromSecret(wallets.merchant);

async function api(path, init = {}, cookie = "") {
  const res = await fetch(`${WEB}/api/v1${path}`, {
    ...init,
    headers: { "content-type": "application/json", origin: WEB, ...(cookie ? { cookie } : {}), ...init.headers },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return { body: res.status === 204 ? null : await res.json(), res };
}

// Wallet sign-in exactly as the browser does it (SEP-53 message).
const ch = (await api("/auth/challenge", { method: "POST", body: JSON.stringify({ address: merchant.publicKey() }) })).body;
const signature = Buffer.from(merchant.signMessage(ch.message)).toString("base64");
const verified = await api("/auth/verify", { method: "POST", body: JSON.stringify({ challengeId: ch.challengeId, signature }) });
const token = (verified.res.headers.get("set-cookie") ?? "").match(/mp_session=([^;]+)/)?.[1];
if (!token) throw new Error("no session cookie");
const cookie = `mp_session=${token}`;

// A presentable name for the demo merchant.
if (process.env.MERCHANT_NAME) await api("/auth/me", { method: "PATCH", body: JSON.stringify({ name: process.env.MERCHANT_NAME }) }, cookie);

const list = async (q) => (await api(`/payment-requests?limit=100${q}`, {}, cookie)).body.data;
const paidList = await list("&status=PAID");
// Prefer a paid request that was also paid a second time: its page shows "Second payment flagged".
const twice = (await api("/transactions?result=ALREADY_PAID&limit=1", {}, cookie)).body.data[0];
const paid = paidList.find((r) => r.reference === twice?.requestRef) ?? paidList[0];
const expired = (await list("&status=EXPIRED"))[0];
const wrong = (await api("/transactions?result=WRONG_AMOUNT&limit=1", {}, cookie)).body.data[0];
// A fresh, untouched request for the checkout shots (the newest pending ones may be flagged).
const pending = (
  await api("/payment-requests", { method: "POST", body: JSON.stringify({ amount: "25", description: "Birthday cake", expiresIn: 86_400 }) }, cookie)
).body;

const browser = await chromium.launch({ channel: process.env.CHANNEL ?? undefined });
const shot = async (name, path, { width = 1440, height = 1000, full = false, wait = 2500, before } = {}) => {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  await ctx.addCookies([{ name: "mp_session", value: token, url: WEB }]);
  const page = await ctx.newPage();
  await page.goto(`${WEB}${path}`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  if (before) await before(page);
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  await ctx.close();
  console.log(`saved ${name}.png`);
};

await shot("01-landing", "/", { full: true });
await shot("02-signin", "/signin", { height: 860 });
await shot("03-overview", "/dashboard");
await shot("04-new-request", "/dashboard/requests/new", {
  before: async (p) => {
    await p.fill("#amt", "42.5");
    await p.fill("#desc", "Birthday cupcakes");
  },
});
await shot("05-request-created", "/dashboard/requests/new", {
  before: async (p) => {
    await p.fill("#amt", "18.5");
    await p.fill("#desc", "Weekly bread order");
    await p.click("button[type=submit]");
    await p.waitForSelector("text=Request created");
  },
});
await shot("06-payment-history", "/dashboard/requests");
if (paid) await shot("07-request-detail-paid", `/dashboard/requests/${paid.reference}`, { height: 1120 });
await shot("08-reconciliation", "/dashboard/reconciliation?view=needs_review", { height: 1040 });
await shot("09-developers", "/dashboard/developers");
if (pending) await shot("10-checkout", `/pay/${pending.reference}`, { width: 390, height: 844 });
if (pending)
  await shot("11-checkout-manual", `/pay/${pending.reference}`, { width: 390, height: 844, before: (p) => p.click("text=Send manually") });
if (paid) await shot("12-paid-receipt", `/pay/${paid.reference}/receipt`, { width: 390, height: 844 });
if (expired) await shot("13-checkout-expired", `/pay/${expired.reference}`, { width: 390, height: 844 });
if (wrong?.requestRef) await shot("14-checkout-wrong-amount", `/pay/${wrong.requestRef}`, { width: 390, height: 844 });
await shot("15-overview-phone", "/dashboard", { width: 390, height: 844, full: true });
await browser.close();
