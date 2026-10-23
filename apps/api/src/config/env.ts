import { Networks, StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";

export const TESTNET_PASSPHRASE = Networks.TESTNET; // "Test SDF Network ; September 2015"

const url = z.string().url();
const bool = z.enum(["true", "false"]).default("false").transform((v) => v === "true");

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4200),
  // Loopback by default: the API sits behind a reverse proxy on the same machine. Reached
  // directly, a client could forge X-Forwarded-For and dodge the per-IP rate limits.
  HOST: z.string().min(1).default("127.0.0.1"),
  // Reverse-proxy hops in front of the API: 1 = Caddy only; 2 = Caddy, then the web app's
  // /api/v1 proxy. req.ip (rate limits) is the address that many hops back.
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "must be a postgresql:// URL"),
  HORIZON_URL: url,
  // Testnet only: MoyaPay refuses to boot against any other network.
  NETWORK_PASSPHRASE: z.literal(TESTNET_PASSPHRASE, {
    errorMap: () => ({ message: `must be the testnet passphrase "${TESTNET_PASSPHRASE}"` }),
  }),
  USDC_ISSUER: z
    .string()
    .refine((v) => StrKey.isValidEd25519PublicKey(v), "must be a valid G address"),
  // The web app's origin(s), comma-separated: CORS, the CSRF check and pay links. The first is
  // the main site (used in pay links); the rest are other addresses serving the same app.
  WEB_ORIGIN: z
    .string()
    .transform((v) => v.split(",").map((o) => o.trim()).filter(Boolean))
    .refine((list) => list.length > 0, "must name at least one origin")
    .refine(
      (list) => list.every((o) => URL.canParse(o) && new URL(o).origin === o),
      "each origin must have no path or trailing slash, e.g. https://moyapay.xyz",
    ),
  COOKIE_DOMAIN: z.string().regex(/^\.?[a-z0-9.-]+$/i, "must be a domain like .moyapay.example").optional(),
  SESSION_SECRET: z
    .string()
    .regex(/^[0-9a-fA-F]+$/, "must be hex")
    .min(64, "must be at least 32 bytes (64 hex chars)"),
  // Development only: allow http:// and private addresses as webhook targets.
  WEBHOOK_ALLOW_INSECURE: bool,
  ALERT_TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  ALERT_TELEGRAM_CHAT_ID: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});
export type Env = z.infer<typeof EnvSchema>;

export class EnvError extends Error {}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Empty strings (e.g. `FOO=` in a .env file) count as unset.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ""));
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new EnvError(`Invalid environment configuration:\n${lines.join("\n")}`);
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.WEBHOOK_ALLOW_INSECURE) {
    throw new EnvError("Invalid environment configuration:\n  - WEBHOOK_ALLOW_INSECURE: must be false in production");
  }
  return parsed.data;
}

function loadOrExit(): Env {
  try {
    return loadEnv();
  } catch (err) {
    if (err instanceof EnvError && !process.env.VITEST) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

export const env: Env = loadOrExit();
/** The main site, used to build pay links. */
export const primaryWebOrigin: string = env.WEB_ORIGIN[0] ?? "";
export const isProduction = env.NODE_ENV === "production";
