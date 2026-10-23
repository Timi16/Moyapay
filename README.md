# MoyaPay

Merchant payment infrastructure on **Stellar Testnet** (no real money). A merchant creates a USDC
payment request and shares its pay link. The payer pays from their own non-custodial wallet
(Freighter, xBull, LOBSTR or Albedo). MoyaPay watches the chain, verifies the payment, matches it to
the right request and marks it **Paid**, usually within seconds. Wrong, failed, duplicate, late and
unmatched payments are recorded with a plain-English reason for the merchant to resolve.

MoyaPay never holds a secret key: wallets sign, and money goes straight from payer to merchant.

## Architecture

```
  Payer's browser                        Merchant's browser / server
  /pay/MP-7KQ2XF                         /dashboard      Bearer mp_test_… (API key)
        │  wallet signs the payment            │                    │
        │  (payment op + memo MP-7KQ2XF)        │ /api/v1 (same origin, session cookie)
        ▼                                      ▼                    │
  Horizon testnet ◀── submit ──┐      ┌──────────────────┐          │
        ▲                      │      │  apps/web (Next) │──proxy──▶│
        │                      └──────│  landing, dash,  │          ▼
        │                             │  checkout        │   ┌──────────────┐
        │  verify by hash ────────────────────────────────── │  apps/api    │  REST /api/v1, SSE
        │                                                    │  server.ts   │──┐
        │                                                    └──────────────┘  │ NOTIFY
        │  /accounts/{dest}/payments?include_failed=true                        ▼ (live updates)
        │  stream per destination, cursor per destination    ┌──────────────┐ ┌──────────┐
        └────────────────────────────────────────────────────│  apps/api    │─│ Postgres │
                                                             │  worker.ts   │ └──────────┘
                                                             │  watcher · matcher · expiry cron
                                                             │  health check · webhooks
                                                             └──────────────┘
```

| Part | What |
|---|---|
| `apps/web` | Next.js 16 (App Router): landing `/`, wallet sign-in `/signin`, merchant dashboard `/dashboard/*`, payer checkout `/pay/[ref]` and receipt. Proxies `/api/v1/*` to the API so cookies stay first-party |
| `apps/api` `server.ts` | Express REST API under `/api/v1`: payment requests, verify by hash, reconciliation, API keys, webhook settings, public checkout, SSE |
| `apps/api` `worker.ts` | One Horizon payments stream per merchant destination (with `include_failed=true&join=transactions`), the matcher, the per-minute expiry cron and watcher health check, status-webhook delivery |
| `packages/shared` | Zod schemas, response types, amount and reference helpers used by both |
| Postgres + Prisma | `Merchant, ApiKey, PaymentRequest, IncomingPayment, RequestEvent, WatcherCursor` (plus sessions, challenges, heartbeat, webhook outbox) |

**How a payment is matched.** Every payment operation into a watched address goes through one
function (`processOperation` in `apps/api/src/engine/matcher.ts`) inside one database transaction:

1. `INSERT … ON CONFLICT (txHash, opId) DO NOTHING`. Already seen? Log `DUPLICATE_IGNORED` and stop. This is the "never count twice" guarantee, and it holds across watcher restarts and verify-by-hash.
2. Find the request by the memo (trimmed, upper-cased) and lock its row.
3. Decide, in order: failed transaction → `FAILED_TX` (request → FAILED); no or unknown reference → `UNMATCHED`; already paid → `ALREADY_PAID`; expired or ledger time after expiry → `LATE`; wrong asset → `WRONG_ASSET`; wrong amount (integer stroops) → `WRONG_AMOUNT`; otherwise `MATCHED`.
4. A match is a conditional update: `… SET status='PAID' WHERE status IN ('PENDING','FAILED') AND paidTxHash IS NULL`. If no row changed, it's recorded as `ALREADY_PAID`.
5. Events, the watcher cursor and any webhook rows commit in the same transaction.

Merchants sign in with their wallet: they sign a SEP-53 message (or, for wallets that can only sign
transactions, a SEP-10-style challenge transaction with sequence 0 that can never be submitted).
No passwords, no stored keys.

## Run it locally

Needs Node 22+, pnpm and Docker (for Postgres).

```sh
pnpm install
cp .env.example .env               # set SESSION_SECRET: openssl rand -hex 32
pnpm db:up                         # Postgres 16 on localhost:5435
pnpm --filter @moyapay/api db:deploy
pnpm dev                           # API on 127.0.0.1:4200
pnpm dev:worker                    # watcher, expiry cron, webhooks
pnpm dev:web                       # web app on http://localhost:3100
```

Open http://localhost:3100, sign in with a Testnet wallet (Freighter set to Testnet, funded with
Friendbot), create a request and pay it from a second wallet. The landing page's "Try the checkout"
opens a labelled preview at `/pay/demo` that moves no money.

### Environment

API and worker read the repo-root `.env` ([.env.example](.env.example)); the API refuses to boot
with anything but the testnet passphrase.

| Variable | |
|---|---|
| `DATABASE_URL` | Postgres URL |
| `HORIZON_URL` | `https://horizon-testnet.stellar.org` |
| `NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` (enforced) |
| `USDC_ISSUER` | Circle testnet USDC, `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` |
| `WEB_ORIGIN` | Exact origin of the web app (CORS, CSRF check, pay links) |
| `SESSION_SECRET` | 64 hex chars; keys session ids and derives webhook signing secrets |
| `PORT`, `HOST`, `TRUST_PROXY` | Listening address, and how many proxy hops to trust (1 = Caddy, 2 = Caddy + web app) |
| `COOKIE_DOMAIN` | Optional, for sibling hosts |
| `WEBHOOK_ALLOW_INSECURE` | Development only: allow `http://` webhook targets |
| `ALERT_TELEGRAM_BOT_TOKEN`, `ALERT_TELEGRAM_CHAT_ID` | Optional alerts (stale watcher, disconnected streams) |

The web app reads [apps/web/.env.example](apps/web/.env.example): `API_ORIGIN` (where to proxy
`/api/v1`), `NEXT_PUBLIC_HORIZON_URL`, `NEXT_PUBLIC_USDC_ISSUER`, `NEXT_PUBLIC_SITE_URL`,
`NEXT_PUBLIC_REPO_URL`.

## Testing

```sh
pnpm lint && pnpm typecheck && pnpm test   # tests start Postgres with Testcontainers (or set TEST_DATABASE_URL)
pnpm e2e                                   # real testnet run; writes a proof table to docs/PROOF.md (not committed)
pnpm screenshots                           # screenshots of the running stack into docs/screenshots (not committed)
```

`pnpm e2e` creates (or reuses) one merchant and three payer wallets with Friendbot, adds USDC
trustlines, buys test USDC on the testnet DEX (or asks you to use Circle's faucet), and then runs
every scenario against the API: six correct payments from three wallets, a short payment, XLM
instead of USDC, no memo, a second payment to a paid reference, a failing transaction and its
retry, a 1-minute expiry paid late, and a watcher restart from an old cursor. By default it
starts its own API and worker; `E2E_API_URL=http://localhost:3100 pnpm e2e` runs it against a
running stack through the web app (the restart check is then skipped).

## Deploy

Postgres in Docker, the API, the worker and the web app under pm2, Caddy in
front for HTTPS ([deploy/Caddyfile.snippet](deploy/Caddyfile.snippet)).

```sh
git clone <repo> ~/moyapay && cd ~/moyapay
cp .env.example .env               # NODE_ENV=production, WEB_ORIGIN, SESSION_SECRET, DATABASE_URL, POSTGRES_PASSWORD, TRUST_PROXY=2
docker compose up -d               # Postgres on 127.0.0.1:5435
pnpm install --frozen-lockfile
pnpm --filter @moyapay/api db:deploy
pnpm build && pnpm build:web
pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
```

Later deploys: `./deploy/deploy.sh <git sha>` pulls, migrates, builds, reloads pm2, polls `/health`
for 60 s and rolls back if it stays unhealthy. CI ([.github/workflows/ci.yml](.github/workflows/ci.yml))
runs audit, lint, typecheck, tests and both builds, then calls that script over SSH.

- Run exactly **one** `moyapay-worker`: it holds one Horizon stream per destination.
- `/health` reports the database, the watcher (latest ledger, stream counts) and open requests.
- The web app can also run on Vercel with `API_ORIGIN` pointing at the API host; then set
  `TRUST_PROXY` to match the hops in front of the API.

## Known limits

- Testnet only. A testnet reset (a few times a year) invalidates saved cursors; reset them with
  `UPDATE "WatcherCursor" SET "pagingToken" = NULL` after the reset.
- An address belongs to one merchant. A custom destination that is another merchant's sign-in
  wallet is refused (`DESTINATION_CLAIMED`).
- Payments are matched by `memo_text` only. MEMO_ID, MEMO_HASH and muxed accounts are recorded as
  `UNMATCHED` and can be assigned by hand.
- Only the master key of a merchant's wallet can sign in (multisig sign-in isn't supported).
