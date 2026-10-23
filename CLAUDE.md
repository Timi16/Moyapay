# MoyaPay

Merchant payment infrastructure on Stellar Testnet: a merchant creates a USDC payment request,
the payer pays from a non-custodial wallet, and the watcher verifies the payment on-chain, matches
it to its request and marks it Paid. Wrong, failed, duplicate and unmatched payments are flagged.

The build plan lives in `docs/Architecture.md` locally (the `docs/` folder is not committed).

## Working rules

1. Follow the plan. If something is unclear or seems wrong, ask before building. If we agree on a change, update the matching doc in the same commit.
2. TypeScript strict everywhere; no `any`, no unexplained `@ts-ignore`.
3. Money is never a float: bigint stroops in code, BigInt columns in Postgres, 7-decimal strings in JSON. `parseFloat` and `Number()` are banned (ESLint enforces it).
4. A payment request's status changes only in `apps/api/src/modules/transitions.ts` (`markPaid`, `markFailed`, `markExpired`), each a conditional update run under the request's row lock. ESLint forbids `status:` in any other `paymentRequest` update.
5. Every incoming operation is recorded once: `UNIQUE (txHash, opId)` on IncomingPayment. The watcher and verify-by-hash share `processOperation` in `engine/matcher.ts`.
6. Expiry is judged by ledger close time. The expiry cron never expires a request past its destination's `syncedAt`.
7. Every payment marked Paid is a real Testnet transaction verified on Horizon. Never simulate one.
8. Never store or log a Stellar secret key, an API key, a session token or a full Authorization header. No `.env` in the repo; `.env.example` only.
9. Testnet only: refuse to boot unless the network passphrase is the testnet one.
10. Before saying a task is done, run `pnpm lint`, `pnpm typecheck` and `pnpm test`, and report the results.
11. Small commits with conventional messages (`feat:`, `fix:`, `test:`, `docs:`).

## Layout

- `apps/api`: one codebase, two processes. `src/server.ts` is the REST API under `/api/v1`; `src/worker.ts` runs the Horizon watcher, the heartbeat, the per-minute expiry and health check, webhook delivery and housekeeping.
- `apps/api/src/engine`: `watcher.ts` (one Horizon stream per destination), `decode.ts`, `matcher.ts` (the decision table), `verify.ts` (verify by hash), `expiry.ts`, `status.ts`, `webhookDelivery.ts`.
- `packages/shared`: Zod schemas, response types, amount and reference helpers shared with the web app.
- `apps/web` (Step 7): Next.js dashboard and checkout.
- Layering: routes → service → Prisma. Everything a merchant reads is filtered by `merchantId`.

## Commands

`pnpm db:up` · `pnpm --filter @moyapay/api db:deploy` · `pnpm dev` · `pnpm dev:worker` ·
`pnpm lint` · `pnpm typecheck` · `pnpm test` (needs Docker for Testcontainers, or `TEST_DATABASE_URL`) · `pnpm e2e`
