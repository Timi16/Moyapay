import type { ApiKey } from "@prisma/client";
import type { ApiKey as ApiKeyDto } from "@moyapay/shared";
import type { AppDeps } from "../../deps";
import { AppError, notFound } from "../../lib/errors";
import { generateApiKey } from "../../lib/ids";

const MAX_ACTIVE_KEYS = 10;

export function serializeApiKey(k: ApiKey): ApiKeyDto {
  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    revokedAt: k.revokedAt?.toISOString() ?? null,
    createdAt: k.createdAt.toISOString(),
  };
}

export function createApiKeyService(deps: AppDeps) {
  const { prisma } = deps;
  return {
    list: (merchantId: string) =>
      prisma.apiKey.findMany({ where: { merchantId }, orderBy: { createdAt: "desc" } }),

    /** The full key is returned exactly once; only its SHA-256 is stored. */
    async create(merchantId: string, name: string): Promise<{ apiKey: ApiKey; key: string }> {
      if ((await prisma.apiKey.count({ where: { merchantId, revokedAt: null } })) >= MAX_ACTIVE_KEYS) {
        throw new AppError("LIMIT_REACHED", `You can have at most ${MAX_ACTIVE_KEYS} active API keys`);
      }
      const { key, prefix, hash } = generateApiKey();
      const apiKey = await prisma.apiKey.create({ data: { merchantId, name, prefix, hash } });
      return { apiKey, key };
    },

    /** Roll: revokes the key and issues a replacement with the same name, in one transaction. */
    async roll(merchantId: string, id: string): Promise<{ apiKey: ApiKey; key: string }> {
      return prisma.$transaction(async (tx) => {
        const old = await tx.apiKey.findFirst({ where: { id, merchantId, revokedAt: null } });
        if (!old) throw notFound("API key");
        await tx.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
        const { key, prefix, hash } = generateApiKey();
        const apiKey = await tx.apiKey.create({ data: { merchantId, name: old.name, prefix, hash } });
        return { apiKey, key };
      });
    },

    /** Revoking twice is a no-op. */
    async revoke(merchantId: string, id: string): Promise<void> {
      const key = await prisma.apiKey.findFirst({ where: { id, merchantId } });
      if (!key) throw notFound("API key");
      if (!key.revokedAt) await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    },
  };
}

export type ApiKeyService = ReturnType<typeof createApiKeyService>;
