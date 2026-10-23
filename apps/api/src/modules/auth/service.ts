import type { Merchant } from "@prisma/client";
import type { Merchant as MerchantDto } from "@moyapay/shared";
import { env } from "../../config/env";
import { uniqueViolation } from "../../db/prisma";
import type { AppDeps } from "../../deps";
import { AppError } from "../../lib/errors";
import { generateSessionToken, hashSessionToken, randomId } from "../../lib/ids";
import { buildChallenge, CHALLENGE_TTL_MS, verifySignedChallenge } from "../../lib/stellar/challenge";
import { verifyWalletSignature, type SignatureInput } from "../../lib/stellar/signature";
import { SESSION_TTL_MS } from "../../middleware/auth";
import { assertValidAddress, claimDestination, reclaimOwnWallet } from "../destinations";

export function serializeMerchant(m: Merchant): MerchantDto {
  return { id: m.id, name: m.name, walletAddress: m.walletAddress, createdAt: m.createdAt.toISOString() };
}

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

export function createAuthService(deps: AppDeps) {
  const { prisma, horizon } = deps;

  return {
    /** Step 1 of sign-in: a one-time challenge for the wallet to sign. */
    async challenge(address: string) {
      assertValidAddress(address, "address");
      const now = new Date();
      const id = randomId(18);
      const c = buildChallenge(address, randomId(24), env.NETWORK_PASSPHRASE, now);
      await prisma.authChallenge.create({
        data: { id, address, message: c.message, txHash: c.txHash, expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS) },
      });
      return {
        challengeId: id,
        message: c.message,
        transaction: c.transaction,
        networkPassphrase: env.NETWORK_PASSPHRASE,
        expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString(),
      };
    },

    /**
     * Step 2: checks the wallet's signature, uses the challenge up, creates the merchant on a
     * first sign-in and starts a session. No password and no key is ever stored.
     */
    async verify(
      input: { challengeId: string; signature?: SignatureInput; signedTransaction?: string; name?: string },
      meta: SessionMeta,
    ): Promise<{ merchant: Merchant; token: string; created: boolean }> {
      const row = await prisma.authChallenge.findUnique({ where: { id: input.challengeId } });
      const expired = new AppError("CHALLENGE_EXPIRED", "This sign-in request expired. Start again.");
      if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) throw expired;

      const ok =
        input.signature !== undefined
          ? verifyWalletSignature(row.address, row.message, input.signature)
          : verifySignedChallenge(input.signedTransaction ?? "", row.txHash, row.address, env.NETWORK_PASSPHRASE);
      if (!ok) throw new AppError("INVALID_SIGNATURE", "The signature does not match this wallet");

      // Single use, even when two verify calls race.
      const used = await prisma.authChallenge.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
      if (used.count === 0) throw expired;

      let merchant = await prisma.merchant.findUnique({ where: { walletAddress: row.address } });
      let created = false;
      if (!merchant) {
        const name = input.name ?? `Merchant ${row.address.slice(0, 4)}…${row.address.slice(-4)}`;
        try {
          merchant = await prisma.merchant.create({ data: { name, walletAddress: row.address } });
          created = true;
        } catch (err) {
          if (!uniqueViolation(err)) throw err;
          merchant = await prisma.merchant.findUniqueOrThrow({ where: { walletAddress: row.address } });
        }
      }
      // The sign-in wallet is the default destination: watch it from now on. The wallet's owner
      // has just proved control of it, so this takes the address back from any merchant that
      // had only named it as a custom destination.
      await reclaimOwnWallet(prisma, merchant.id, merchant.walletAddress);
      await claimDestination(prisma, horizon, merchant.id, merchant.walletAddress);

      const token = generateSessionToken();
      await prisma.session.create({
        data: {
          id: hashSessionToken(token),
          merchantId: merchant.id,
          expiresAt: new Date(Date.now() + SESSION_TTL_MS),
          ip: meta.ip ?? null,
          userAgent: meta.userAgent?.slice(0, 300) ?? null,
        },
      });
      return { merchant, token, created };
    },

    async logout(sessionId: string | undefined): Promise<void> {
      if (sessionId) await prisma.session.deleteMany({ where: { id: sessionId } });
    },

    async me(merchantId: string): Promise<Merchant> {
      const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
      if (!merchant) throw new AppError("UNAUTHENTICATED", "Authentication required");
      return merchant;
    },

    updateMerchant(merchantId: string, data: { name: string }): Promise<Merchant> {
      return prisma.merchant.update({ where: { id: merchantId }, data: { name: data.name } });
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
