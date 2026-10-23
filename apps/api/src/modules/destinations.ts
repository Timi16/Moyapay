import type { PrismaClient } from "@prisma/client";
import { StrKey } from "@stellar/stellar-sdk";
import { CHANNELS, notify } from "../db/notify";
import { uniqueViolation } from "../db/prisma";
import { usdc } from "../lib/asset";
import { AppError } from "../lib/errors";
import { cursorForLedger, type Horizon } from "../lib/stellar/horizon";

/** Payments that closed this long before an address was claimed are still recorded. */
const WATCH_FROM_SLACK_MS = 60_000;

const claimed = () =>
  new AppError("DESTINATION_CLAIMED", "This address already receives payments for another MoyaPay merchant");

export function assertValidAddress(address: string, field = "destination"): void {
  if (!StrKey.isValidEd25519PublicKey(address)) {
    throw new AppError("VALIDATION_FAILED", "Not a valid Stellar account address", {
      details: [{ path: field, message: "Not a valid Stellar account address" }],
    });
  }
}

/** Who watches this address, if anyone: the merchant whose WatcherCursor row it is. */
export async function destinationOwner(prisma: PrismaClient, address: string): Promise<string | null> {
  const row = await prisma.watcherCursor.findUnique({ where: { destination: address }, select: { merchantId: true } });
  return row?.merchantId ?? null;
}

/**
 * Starts watching `address` for `merchantId`. An address is watched for exactly one merchant,
 * so every payment to it has one owner. Another merchant's sign-in wallet can never be
 * claimed. The stream starts a ledger before now, not at the account's first payment.
 */
export async function claimDestination(
  prisma: PrismaClient,
  horizon: Horizon,
  merchantId: string,
  address: string,
): Promise<void> {
  const owner = await destinationOwner(prisma, address);
  if (owner === merchantId) return;
  if (owner) throw claimed();
  const wallet = await prisma.merchant.findUnique({ where: { walletAddress: address }, select: { id: true } });
  if (wallet && wallet.id !== merchantId) throw claimed();

  let pagingToken: string | null = null;
  try {
    const tip = await horizon.latestLedger();
    pagingToken = cursorForLedger(Math.max(tip.ledger - 1, 1));
  } catch {
    // Horizon unreachable: the watcher reads the account's history and skips anything
    // before watchFrom instead.
  }
  try {
    await prisma.watcherCursor.create({
      data: { destination: address, merchantId, pagingToken, watchFrom: new Date(Date.now() - WATCH_FROM_SLACK_MS) },
    });
  } catch (err) {
    if (!uniqueViolation(err)) throw err;
    if ((await destinationOwner(prisma, address)) !== merchantId) throw claimed();
    return;
  }
  await notify(prisma, CHANNELS.destinationsChanged, { destination: address });
}

/**
 * The wallet's owner signed in: if another merchant had claimed this address as a custom
 * destination, it moves to the owner from now on. That merchant's open requests to it stop
 * matching (they are UNMATCHED for the owner), which is right: nobody proved they own it.
 */
export async function reclaimOwnWallet(prisma: PrismaClient, merchantId: string, address: string): Promise<void> {
  const moved = await prisma.watcherCursor.updateMany({
    where: { destination: address, merchantId: { not: merchantId } },
    data: { merchantId, watchFrom: new Date() },
  });
  if (moved.count > 0) await notify(prisma, CHANNELS.destinationsChanged, { destination: address });
}

/** Checks that `address` exists on testnet and can hold USDC. */
export async function assertCanReceiveUsdc(horizon: Horizon, address: string): Promise<void> {
  const account = await horizon.account(address);
  if (!account.exists) {
    throw new AppError("ACCOUNT_NOT_FOUND", "This address isn't funded on Stellar Testnet yet. Fund it with Friendbot first.");
  }
  const asset = usdc();
  const line = account.trustlines.find((t) => t.code === asset.code && t.issuer === asset.issuer);
  if (!line || !line.authorized) {
    throw new AppError("NO_TRUSTLINE", "This address has no USDC trustline, so it can't receive USDC. Add the USDC trustline first.");
  }
}
