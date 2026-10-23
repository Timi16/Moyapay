import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { REFERENCE_ALPHABET, REFERENCE_LENGTH } from "@moyapay/shared";
import { env } from "../config/env";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function randomBase62(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += BASE62[randomInt(BASE62.length)];
  return out;
}

/** "MP-" + 6 characters from a CSPRNG. Callers retry on a unique-constraint collision. */
export function generateReference(): string {
  let out = "MP-";
  for (let i = 0; i < REFERENCE_LENGTH; i++) out += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  return out;
}

export const API_KEY_PREFIX = "mp_test_";

/** mp_test_ + 40 base62 chars (~238 bits). Only the SHA-256 is stored. */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = API_KEY_PREFIX + randomBase62(40);
  return { key, prefix: key.slice(0, API_KEY_PREFIX.length + 4), hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** 32 random bytes, base64url. Goes in the cookie; never stored. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

function keyed(purpose: string, value: string): string {
  return createHmac("sha256", Buffer.from(env.SESSION_SECRET, "hex")).update(`${purpose}.${value}`).digest("hex");
}

/** Session row id: keyed hash of the token, so a database leak alone is useless. */
export function hashSessionToken(token: string): string {
  return keyed("session", token);
}

/**
 * A merchant's webhook signing secret. Derived, not stored: rolling the secret bumps the
 * version, which changes the output.
 */
export function webhookSecret(merchantId: string, version: number): string {
  return `whsec_${keyed("webhook", `${merchantId}.${version}`).slice(0, 48)}`;
}

export function randomId(bytes = 18): string {
  return randomBytes(bytes).toString("base64url");
}
