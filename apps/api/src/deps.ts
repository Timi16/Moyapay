import type { PrismaClient } from "@prisma/client";
import type { Logger } from "pino";
import type { Horizon } from "./lib/stellar/horizon";
import type { LiveHub } from "./modules/stream/hub";

export interface Limits {
  /** Sign-in challenge and verify: per IP per minute (shared across instances). */
  authPerMin: number;
  /** Public checkout reads: per IP per minute. The checkout polls every 3 s. */
  publicPerMin: number;
  /** Public verify-by-hash: per IP per minute (each call hits Horizon). */
  publicVerifyPerMin: number;
  v1PerMin: number;
  /** Pre-auth ceiling on /api/v1 per IP, so bad keys can't hammer the DB. */
  v1PerIpPerMin: number;
  sseStreamsPerIp: number;
  sseStreamsPerMerchant: number;
  sseStreamsTotal: number;
}

export const DEFAULT_LIMITS: Limits = {
  authPerMin: 20,
  publicPerMin: 120,
  publicVerifyPerMin: 20,
  v1PerMin: 300,
  v1PerIpPerMin: 1000,
  sseStreamsPerIp: 5,
  sseStreamsPerMerchant: 10,
  sseStreamsTotal: 1000,
};

export interface AppDeps {
  prisma: PrismaClient;
  horizon: Horizon;
  hub: LiveHub;
  logger: Logger;
  limits: Limits;
  /** Development only: allow http:// and private webhook targets. */
  allowInsecureWebhooks: boolean;
}
