import type { PaymentResult, RequestStatus } from "@moyapay/shared";

// Amounts stay decimal strings end to end: these helpers only move characters around.

/** "1245.5000000" -> "1,245.50"; keeps every significant decimal ("0.0000001" stays). */
export function money(amount: string): string {
  const [rawWhole = "0", rawFrac = ""] = amount.split(".");
  const whole = rawWhole.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = rawFrac.replace(/0+$/, "").padEnd(2, "0");
  return `${whole}.${frac}`;
}

/** The whole-number part of an amount, as an integer, for drawing bars and lines only. */
export function wholeUnits(amount: string): number {
  return Number.parseInt(amount.split(".")[0] ?? "0", 10) || 0;
}

/** Ratio a/b in percent (0-100) of two decimal strings, without floats on the inputs. */
export function percentOf(a: string, b: string): number {
  const scale = (v: string) => {
    const [w = "0", f = ""] = v.split(".");
    return BigInt(w) * 10_000_000n + BigInt(f.padEnd(7, "0").slice(0, 7));
  };
  const den = scale(b);
  if (den === 0n) return 0;
  const pct = (scale(a) * 100n) / den;
  return Number.parseInt((pct > 100n ? 100n : pct).toString(), 10);
}

/** Difference b - a of two decimal strings, as a display amount. */
export function shortfall(paid: string, asked: string): string {
  const scale = (v: string) => {
    const [w = "0", f = ""] = v.split(".");
    return BigInt(w) * 10_000_000n + BigInt(f.padEnd(7, "0").slice(0, 7));
  };
  let d = scale(asked) - scale(paid);
  const neg = d < 0n;
  if (neg) d = -d;
  const s = `${d / 10_000_000n}.${(d % 10_000_000n).toString().padStart(7, "0")}`;
  return (neg ? "-" : "") + money(s);
}

export const shortAddr = (a: string) => (a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);
export const shortHash = (h: string) => (h.length > 16 ? `${h.slice(0, 8)}…${h.slice(-8)}` : h);
export const tinyHash = (h: string) => (h.length > 10 ? `${h.slice(0, 4)}…${h.slice(-4)}` : h);

const dayTime = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fullDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const timeOnly = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** "23 Oct, 09:12" */
export const when = (iso: string) => dayTime.format(new Date(iso)).replace(" at ", ", ");
/** "23 Oct 2026, 09:41" */
export const whenFull = (iso: string) => fullDate.format(new Date(iso)).replace(" at ", ", ");
/** "09:41:03" */
export const clock = (iso: string) => timeOnly.format(new Date(iso));

/** "just now", "4 min", "2 h", "3 d" */
export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86_400) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86_400)} d`;
}

/** "in 23 h 31 m", "in 6 d", "in 45 s"; null once passed. */
export function timeLeft(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const s = Math.round((new Date(iso).getTime() - now) / 1000);
  if (s <= 0) return null;
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} m`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} m`;
  return `${Math.floor(s / 86_400)} d`;
}

/** Ring label: "23h", "45m", "30s", "6d" */
export function ringLabel(iso: string | null, now = Date.now()): string {
  if (!iso) return "∞";
  const s = Math.max(0, Math.round((new Date(iso).getTime() - now) / 1000));
  if (s >= 86_400) return `${Math.floor(s / 86_400)}d`;
  if (s >= 3600) return `${Math.floor(s / 3600)}h`;
  if (s >= 60) return `${Math.floor(s / 60)}m`;
  return `${s}s`;
}

export type ChipClass = "ok" | "wait" | "bad" | "off" | "unk";

export const STATUS_CHIP: Record<RequestStatus, [string, ChipClass]> = {
  PENDING: ["Pending", "wait"],
  PAID: ["Paid", "ok"],
  FAILED: ["Failed", "bad"],
  EXPIRED: ["Expired", "off"],
};

export const RESULT_CHIP: Record<PaymentResult, [string, ChipClass]> = {
  MATCHED: ["Matched", "ok"],
  WRONG_AMOUNT: ["Wrong amount", "wait"],
  WRONG_ASSET: ["Wrong asset", "bad"],
  ALREADY_PAID: ["Already paid", "bad"],
  LATE: ["Late", "off"],
  UNMATCHED: ["Unmatched", "unk"],
  FAILED_TX: ["Failed on-chain", "bad"],
};

export const RESULT_KIND: Record<PaymentResult, string> = {
  MATCHED: "matched",
  WRONG_AMOUNT: "wrong amount",
  WRONG_ASSET: "wrong asset",
  ALREADY_PAID: "paid twice",
  LATE: "too late",
  UNMATCHED: "no reference",
  FAILED_TX: "failed",
};

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "M") + (words[1]?.[0] ?? "")).toUpperCase();
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
