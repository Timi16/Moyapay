import { createHmac, timingSafeEqual } from "node:crypto";

// Same scheme as Timmy's Webhook project: hex(HMAC_SHA256(secret, timestamp + "." + rawBody)),
// sent as "MoyaPay-Signature: v1=<hex>".

export function signPayload(secret: string, timestamp: number, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/** Reference verifier for receivers (docs/API.md shows the same code). */
export function verifySignature(
  secret: string,
  header: string,
  timestamp: string,
  rawBody: string,
  opts: { toleranceSeconds?: number; now?: number } = {},
): boolean {
  if (!/^\d{1,12}$/.test(timestamp)) return false;
  const ts = Number.parseInt(timestamp, 10);
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > (opts.toleranceSeconds ?? 300)) return false;
  const expected = Buffer.from(signPayload(secret, ts, rawBody), "hex");
  return header
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1="))
    .some((part) => {
      const candidate = Buffer.from(part.slice(3), "hex");
      return candidate.length === expected.length && timingSafeEqual(candidate, expected);
    });
}
