"use client";

import type { Summary, WatcherStatus } from "@moyapay/shared";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { shortAddr } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Icon, type IconName } from "./Icon";
import { Logo } from "./Logo";

const NAV: { href: string; label: string; icon: IconName; exact?: boolean }[] = [
  { href: "/dashboard", label: "Overview", icon: "overview", exact: true },
  { href: "/dashboard/requests", label: "Payment requests", icon: "receipt" },
  { href: "/dashboard/reconciliation", label: "Reconciliation", icon: "swap" },
  { href: "/dashboard/developers", label: "Developers", icon: "code" },
  { href: "/dashboard/settings", label: "Settings", icon: "sliders" },
];

export function MerchantAvatar({ name, size = 34 }: { name: string; size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        flex: "0 0 auto",
        borderRadius: Math.round(size * 0.3),
        background: "#FFE7D1",
        color: "#9A3412",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 800,
        fontSize: Math.round(size * 0.42),
      }}
    >
      {(name.trim()[0] ?? "M").toUpperCase()}
    </span>
  );
}

/** Re-renders every second, for "2s ago" style labels. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function WatcherCard() {
  const { data } = useSWR<WatcherStatus>("/public/status", fetcher, { refreshInterval: 5000 });
  const now = useNow();
  const age = data?.latestLedgerAt ? Math.max(0, Math.round((now - new Date(data.latestLedgerAt).getTime()) / 1000)) : null;
  const healthy = data?.healthy ?? false;
  return (
    <div
      style={{
        marginTop: "auto",
        padding: 14,
        borderRadius: 16,
        background: "linear-gradient(135deg, #F3F0FF, #EDE9FF)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
      aria-live="polite"
    >
      <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "#12102A" }}>
        <span className={`live ${healthy ? "" : "down"}`} />
        {!data ? "Connecting to Stellar…" : healthy ? "Watching Stellar Testnet" : "Watcher reconnecting"}
      </span>
      <span className="mono" style={{ fontSize: 12, color: "#5B5876" }}>
        {data?.latestLedger
          ? `ledger ${data.latestLedger.toLocaleString("en-US")} · ${age === null ? "…" : age < 60 ? `${age}s ago` : `${Math.round(age / 60)}m ago`}`
          : "waiting for the first ledger"}
      </span>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { merchant } = useSession();
  const { data: summary } = useSWR<Summary>("/summary", fetcher, { refreshInterval: 15_000 });
  const badge = summary?.needsReview ?? 0;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexWrap: "wrap", background: "#F6F5FB", color: "#12102A" }}>
      <aside
        className="no-print"
        style={{
          flex: "1 1 248px",
          maxWidth: "100%",
          padding: "20px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          background: "#FFFFFF",
          borderRight: "1px solid #ECEAF5",
        }}
      >
        <Logo href="/dashboard" />
        <Link
          href="/dashboard/settings"
          style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, border: "1px solid #ECEAF5", borderRadius: 14, background: "#FFFFFF", color: "#12102A" }}
        >
          <MerchantAvatar name={merchant.name} />
          <span style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{merchant.name}</span>
            <span className="mono" style={{ fontSize: 12, color: "#77748F" }}>
              {shortAddr(merchant.walletAddress)}
            </span>
          </span>
          <Icon name="updown" size={16} stroke={2.2} color="#77748F" />
        </Link>
        <nav aria-label="Dashboard" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map((n) => {
            const on = n.exact ? pathname === n.href : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={`nav ${on ? "on" : ""}`} aria-current={on ? "page" : undefined}>
                <Icon name={n.icon} />
                {n.label}
                {n.href === "/dashboard/reconciliation" && badge > 0 && (
                  <span
                    aria-label={`${badge} need review`}
                    style={{
                      marginLeft: "auto",
                      minWidth: 22,
                      height: 22,
                      padding: "0 7px",
                      borderRadius: 999,
                      background: "#5B3DF5",
                      color: "#FFFFFF",
                      fontSize: 12,
                      fontWeight: 800,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <WatcherCard />
      </aside>
      <main style={{ flex: "999 1 560px", minWidth: 0, display: "flex", flexDirection: "column" }}>{children}</main>
    </div>
  );
}

/** The padded column most dashboard pages use. */
export function Page({ children, gap = 20 }: { children: ReactNode; gap?: number }) {
  return <div style={{ padding: "28px clamp(16px, 3vw, 32px) 48px", display: "flex", flexDirection: "column", gap }}>{children}</div>;
}

export function PageHeader({ title, sub, children, mono }: { title: ReactNode; sub?: ReactNode; children?: ReactNode; mono?: boolean }) {
  return (
    <header className="rise" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
      <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <h1
          className={mono ? "mono" : undefined}
          style={mono ? { margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: "0.01em" } : { margin: 0, fontSize: 28, letterSpacing: "-0.04em", fontWeight: 800 }}
        >
          {title}
        </h1>
        {sub && <span style={{ fontSize: 14, color: "#77748F" }}>{sub}</span>}
      </div>
      {children}
    </header>
  );
}
