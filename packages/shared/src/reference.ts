/**
 * Payment references: "MP-" + 6 characters of Crockford base32 without the look-alikes
 * 0, O, 1, I and L (Crockford already drops I, L, O and U). 30^6 ≈ 729 million values.
 * A reference is the payer's memo_text, so it must fit in 28 bytes; it uses 9.
 */
export const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export const REFERENCE_LENGTH = 6;
export const REFERENCE_REGEX = /^MP-[2-9A-HJKMNP-TV-Z]{6}$/;

/**
 * Turns a memo as the payer typed it into a reference: trims, upper-cases and drops inner
 * whitespace, and accepts a missing dash ("mp7kq2xf"). Returns null unless the result is a
 * well-formed reference.
 */
export function normalizeReference(raw: string): string | null {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, "");
  const match = /^MP-?([A-Z0-9]{6})$/.exec(cleaned);
  if (!match) return null;
  const ref = `MP-${match[1]}`;
  return REFERENCE_REGEX.test(ref) ? ref : null;
}
