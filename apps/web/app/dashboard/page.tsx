"use client";

import type { ActivityItem, Page as ApiPage, PaymentRequest, RequestStatus, Summary } from "@moyapay/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { MerchantAvatar, useNow } from "@/components/AppShell";
import { StatusChip } from "@/components/Chip";
import { Icon, type IconName } from "@/components/Icon";
import { fetcher } from "@/lib/api";
import { ago, greeting, money, RESULT_KIND, tinyHash, wholeUnits } from "@/lib/format";
import { useSession } from "@/lib/session";

/** SVG path for the 30-day line in the Collected card (drawing only). */
function sparkline(daily: { amount: string }[]): { line: string; area: string } {
  const values = daily.map((d) => wholeUnits(d.amount));
  // Cumulative, so the line climbs with each day's collections.
  let run = 0;
  const cum = values.map((v) => (run += v));
  const max = Math.max(1, ...cum);
  const pts = cum.map((v, i) => [(i / Math.max(1, cum.length - 1)) * 400, 80 - (v / max) * 66]);
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x?.toFixed(1)} ${y?.toFixed(1)}`).join(" ");
  return { line, area: `${line} L400 90 L0 90 Z` };
}

const FEED: Record<string, { icon: IconName; bg: string; fg: string }> = {
  PAID: { icon: "check", bg: "#E7F8EF", fg: "#067647" },
  CREATED: { icon: "plus", bg: "#F3F0FF", fg: "#4527D9" },
  CHECKOUT_OPENED: { icon: "receipt", bg: "#F0EFF5", fg: "#5B5876" },
  FLAGGED: { icon: "warn", bg: "#FFF4E0", fg: "#9A5B00" },
  FAILED: { icon: "x", bg: "#FEECEB", fg: "#B42318" },
  EXPIRED: { icon: "clock", bg: "#F0EFF5", fg: "#5B5876" },
  UNMATCHED: { icon: "question", bg: "#E6F0FF", fg: "#1D4ED8" },
};

function feedTitle(a: ActivityItem): string {
  const amt = a.amount ? ` · ${money(a.amount)}` : "";
  switch (a.type) {
    case "PAID":
      return `${a.reference} paid${amt}`;
    case "CREATED":
      return `${a.reference} created${amt}`;
    case "EXPIRED":
      return `${a.reference} expired`;
    case "FAILED":
      return `${a.reference} payment failed`;
    case "CHECKOUT_OPENED":
      return `${a.reference} checkout opened`;
    case "FLAGGED":
      return `${a.reference} payment flagged`;
    default:
      return a.kind === "payment" ? `${a.amount ? money(a.amount) : ""} ${a.type === "UNMATCHED" ? "with no reference" : RESULT_KIND[a.type as keyof typeof RESULT_KIND] ?? ""}`.trim() : a.message;
  }
}

function Stat({ label, value, children, className }: { label: string; value: string | number; children?: React.ReactNode; className: string }) {
  return (
    <div className={`card rise ${className}`} style={{ padding: 18, display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#77748F" }}>{label}</span>
      <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.04em" }}>{value}</span>
      {children}
    </div>
  );
}

export default function Overview() {
  const router = useRouter();
  const { merchant } = useSession();
  const now = useNow(30_000);
  const [tab, setTab] = useState<"all" | RequestStatus>("all");
  const { data: s } = useSWR<Summary>("/summary", fetcher, { refreshInterval: 10_000 });
  const { data: recent } = useSWR<ApiPage<PaymentRequest>>(`/payment-requests?limit=6${tab === "all" ? "" : `&status=${tab}`}`, fetcher, {
    refreshInterval: 8000,
  });
  const { data: feed } = useSWR<{ data: ActivityItem[] }>("/activity?limit=6", fetcher, { refreshInterval: 5000 });
  const spark = s ? sparkline(s.collected30d.daily) : null;
  // A business name, not a first name: greet it in full.
  const name = merchant.name;
  const date = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(now);

  return (
    <>
      <div style={{ minHeight: 68, padding: "12px clamp(16px, 3vw, 32px)", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, borderBottom: "1px solid #ECEAF5", background: "#FFFFFF" }}>
        <form
          role="search"
          style={{ position: "relative", flex: "0 1 360px", minWidth: 200 }}
          onSubmit={(e) => {
            e.preventDefault();
            const q = new FormData(e.currentTarget).get("q")?.toString().trim();
            if (q) router.push(`/dashboard/requests?q=${encodeURIComponent(q)}`);
          }}
        >
          <span style={{ position: "absolute", left: 12, top: 11, color: "#77748F" }}>
            <Icon name="search" stroke={2.2} />
          </span>
          <input name="q" type="search" aria-label="Search" placeholder="Search references, hashes…" className="search" />
        </form>
        <span style={{ flexGrow: 1 }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 32, padding: "0 12px", borderRadius: 999, background: "#FFF4E0", color: "#9A5B00", fontSize: 12, fontWeight: 700 }}>
          Testnet
        </span>
        <Link href="/dashboard/settings" aria-label="Settings">
          <MerchantAvatar name={merchant.name} size={36} />
        </Link>
      </div>

      <div style={{ padding: "28px clamp(16px, 3vw, 32px) 48px", display: "flex", flexDirection: "column", gap: 22 }}>
        <header className="rise" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
          <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            <h1 style={{ margin: 0, fontSize: 28, letterSpacing: "-0.04em", fontWeight: 800 }}>
              {greeting(new Date(now))}, {name}
            </h1>
            <span style={{ fontSize: 14, fontWeight: 500, color: "#77748F" }}>{date} · all amounts in USDC</span>
          </div>
          <Link href="/dashboard/requests/new" className="btn">
            <Icon name="plus" stroke={2.6} />
            New request
          </Link>
        </header>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <section
            className="rise d1"
            aria-label="Collected"
            style={{ flex: "2 1 420px", minWidth: 0, position: "relative", overflow: "hidden", borderRadius: 20, padding: "22px 24px", color: "#FFFFFF", background: "var(--grad)", display: "flex", flexDirection: "column", gap: 6 }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: "#E4DDFF" }}>Collected · last 30 days</span>
            <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.05em" }}>
              {s ? money(s.collected30d.amount) : "…"} <span style={{ fontSize: 18, color: "#CFC3FF" }}>USDC</span>
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#E4DDFF" }}>
              {s ? `${s.paid30d} payment${s.paid30d === 1 ? "" : "s"} verified on-chain` : " "}
            </span>
            <svg aria-hidden="true" viewBox="0 0 400 90" preserveAspectRatio="none" style={{ width: "100%", height: 80, marginTop: 6 }}>
              {spark && (
                <>
                  <path d={spark.line} fill="none" stroke="#FFFFFF" strokeWidth={2.5} strokeLinecap="round" className="line" />
                  <path d={spark.area} fill="#FFFFFF" fillOpacity={0.1} />
                </>
              )}
            </svg>
          </section>
          <section style={{ flex: "1 1 260px", minWidth: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
            <Stat label="Paid" value={s?.paid30d ?? "…"} className="d2">
              <span className="chip ok" style={{ alignSelf: "flex-start" }}>
                Verified
              </span>
            </Stat>
            <Stat label="Pending" value={s?.pending ?? "…"} className="d3">
              <span className="chip wait" style={{ alignSelf: "flex-start" }}>
                {s ? `${money(s.pendingAmount)} due` : "…"}
              </span>
            </Stat>
            <Link href="/dashboard/reconciliation" className="card rise d4" style={{ gridColumn: "1 / -1", padding: 18, display: "flex", alignItems: "center", gap: 14, color: "#12102A" }}>
              <span style={{ width: 42, height: 42, flex: "0 0 auto", borderRadius: 12, background: "#EDE9FF", color: "#4527D9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={s && s.needsReview === 0 ? "check" : "warn"} size={20} stroke={2.2} />
              </span>
              <span style={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 15, fontWeight: 800 }}>
                  {!s ? "…" : s.needsReview === 0 ? "Nothing needs a look" : `${s.needsReview} payment${s.needsReview === 1 ? " needs" : "s need"} a look`}
                </span>
                <span style={{ fontSize: 13, color: "#77748F" }}>
                  {s && s.needsReviewKinds.length > 0
                    ? s.needsReviewKinds.map((k) => RESULT_KIND[k]).join(", ").replace(/^./, (c) => c.toUpperCase())
                    : "Every payment matched its request"}
                </span>
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#5B3DF5" }}>Review</span>
            </Link>
          </section>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
          <section className="card rise d3" aria-labelledby="recent" style={{ flex: "999 1 560px", minWidth: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "16px 18px" }}>
              <h2 id="recent" style={{ margin: 0, flexGrow: 1, fontSize: 17, fontWeight: 800 }}>
                Recent requests
              </h2>
              <div role="tablist" aria-label="Filter" className="tabs">
                {(
                  [
                    ["all", "All"],
                    ["PENDING", "Pending"],
                    ["PAID", "Paid"],
                  ] as const
                ).map(([k, label]) => (
                  <button key={k} type="button" role="tab" className="tab sm" aria-selected={tab === k} onClick={() => setTab(k)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>For</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                    <th>Status</th>
                    <th>Transaction</th>
                  </tr>
                </thead>
                <tbody>
                  {recent?.data.map((r) => (
                    <tr key={r.id} className="r slide">
                      <td>
                        <Link href={`/dashboard/requests/${r.reference}`} className="mono" style={{ fontWeight: 600 }}>
                          {r.reference}
                        </Link>
                      </td>
                      <td style={{ color: "#5B5876", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{r.description ?? "—"}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{money(r.amount)}</td>
                      <td>
                        <StatusChip status={r.status} />
                      </td>
                      <td className="mono" style={{ fontSize: 13, color: "#77748F" }}>
                        {r.paidTxHash ? tinyHash(r.paidTxHash) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {recent && recent.data.length === 0 && (
                <div style={{ padding: "36px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
                  <span style={{ fontSize: 16, fontWeight: 800 }}>No requests yet</span>
                  <span style={{ fontSize: 14, color: "#77748F" }}>Create a pay link and share it with your customer.</span>
                  <Link href="/dashboard/requests/new" className="btn" style={{ marginTop: 4 }}>
                    <Icon name="plus" stroke={2.6} />
                    New request
                  </Link>
                </div>
              )}
              {!recent && <div className="skel" style={{ height: 220, margin: 18 }} />}
            </div>
            <Link href="/dashboard/requests" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 48, fontSize: 14, fontWeight: 700 }}>
              See all requests
            </Link>
          </section>

          <section className="card rise d4" aria-labelledby="feed" style={{ flex: "1 1 300px", minWidth: 0, padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <h2 id="feed" style={{ margin: 0, flexGrow: 1, fontSize: 17, fontWeight: 800 }}>
                Live activity
              </h2>
              <span className="live" />
            </div>
            <ol aria-live="polite" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
              {feed?.data.map((a, i) => {
                const look = FEED[a.type] ?? FEED.FLAGGED!;
                const sub = a.txHash ? `${tinyHash(a.txHash)} · ${ago(a.at, now)}` : `${a.type === "FLAGGED" || a.kind === "payment" ? a.message : ""}${a.type === "FLAGGED" || a.kind === "payment" ? " · " : ""}${ago(a.at, now)}`;
                const href = a.reference ? `/dashboard/requests/${a.reference}` : "/dashboard/reconciliation";
                return (
                  <li key={a.id} className="slide" style={{ animationDelay: `${i * 0.1}s`, borderBottom: i === feed.data.length - 1 ? 0 : "1px solid #F1F0F7" }}>
                    <Link href={href} style={{ display: "flex", gap: 12, padding: "12px 0", color: "#12102A" }}>
                      <span style={{ flex: "0 0 auto", width: 34, height: 34, borderRadius: "50%", background: look.bg, color: look.fg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name={look.icon} size={16} stroke={2.6} />
                      </span>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>{feedTitle(a)}</span>
                        <span className={a.txHash ? "mono" : undefined} style={{ fontSize: 12, color: "#77748F", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {sub}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
              {feed && feed.data.length === 0 && <li style={{ padding: "18px 0", fontSize: 14, color: "#77748F" }}>Payments show up here the second they land.</li>}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}
