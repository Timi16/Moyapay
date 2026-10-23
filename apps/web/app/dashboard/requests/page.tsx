"use client";

import type { Page as ApiPage, PaymentRequest, RequestCounts, RequestStatus } from "@moyapay/shared";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import useSWRInfinite from "swr/infinite";
import { Page, PageHeader } from "@/components/AppShell";
import { StatusChip } from "@/components/Chip";
import { Icon } from "@/components/Icon";
import { API, fetcher } from "@/lib/api";
import { money, shortHash, timeLeft, when } from "@/lib/format";

type ListPage = ApiPage<PaymentRequest> & { counts: RequestCounts };
const TABS: ["all" | RequestStatus, string][] = [
  ["all", "All"],
  ["PENDING", "Pending"],
  ["PAID", "Paid"],
  ["FAILED", "Failed"],
  ["EXPIRED", "Expired"],
];

function settled(r: PaymentRequest): string {
  if (r.paidAt) return when(r.paidAt);
  if (r.status === "EXPIRED" && r.expiresAt) return when(r.expiresAt);
  if (r.status === "FAILED") return "failed, open for retry";
  const left = timeLeft(r.expiresAt);
  return r.expiresAt ? (left ? `expires in ${left.split(" ").slice(0, 2).join(" ")}` : "expiring") : "never expires";
}

function Requests() {
  const router = useRouter();
  const params = useSearchParams();
  const status = (params.get("status") as RequestStatus | null) ?? "all";
  const q = params.get("q") ?? "";
  const [search, setSearch] = useState(q);

  // Search as you type, but only push the URL after a short pause.
  useEffect(() => {
    if (search === q) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (search.trim()) next.set("q", search.trim());
      else next.delete("q");
      router.replace(`/dashboard/requests?${next.toString()}`);
    }, 300);
    return () => clearTimeout(t);
  }, [search, q, params, router]);

  const query = (cursor: string | null) => {
    const p = new URLSearchParams({ limit: "25" });
    if (status !== "all") p.set("status", status);
    if (q) p.set("q", q);
    if (cursor) p.set("cursor", cursor);
    return p.toString();
  };
  const { data, size, setSize, isValidating } = useSWRInfinite<ListPage>(
    (i, prev: ListPage | null) => (i > 0 && !prev?.nextCursor ? null : `/payment-requests?${query(i === 0 ? null : (prev?.nextCursor ?? null))}`),
    fetcher,
    { refreshInterval: 10_000 },
  );
  const rows = data?.flatMap((p) => p.data) ?? [];
  const counts = data?.[0]?.counts;
  const total = counts ? (status === "all" ? counts.ALL : counts[status]) : 0;
  const hasMore = Boolean(data?.[data.length - 1]?.nextCursor);
  const csv = `${API}/payment-requests?format=csv${status !== "all" ? `&status=${status}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  const pick = (s: "all" | RequestStatus) => {
    const next = new URLSearchParams(params.toString());
    if (s === "all") next.delete("status");
    else next.set("status", s);
    router.replace(`/dashboard/requests?${next.toString()}`);
  };

  return (
    <Page>
      <PageHeader title="Payment requests" sub="Every request you've made and where it stands.">
        <a href={csv} className="btn alt" download>
          <Icon name="download" size={16} stroke={2.4} />
          Export CSV
        </a>
        <Link href="/dashboard/requests/new" className="btn">
          <Icon name="plus" stroke={2.6} />
          New request
        </Link>
      </PageHeader>

      <section className="card rise d1" style={{ overflow: "hidden" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid #ECEAF5" }}>
          <div role="tablist" aria-label="Status" className="tabs">
            {TABS.map(([k, label]) => (
              <button key={k} type="button" role="tab" className="tab" aria-selected={status === k} onClick={() => pick(k)}>
                {label}
                <b>{counts ? (k === "all" ? counts.ALL : counts[k]) : "·"}</b>
              </button>
            ))}
          </div>
          <span style={{ flexGrow: 1 }} />
          <label style={{ position: "relative", flex: "0 1 280px", minWidth: 200 }}>
            <span style={{ position: "absolute", left: 12, top: 11, color: "#77748F" }}>
              <Icon name="search" stroke={2.2} />
            </span>
            <input type="search" aria-label="Search by reference or hash" placeholder="Reference or tx hash" className="search" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Reference</th>
                <th>For</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th>Status</th>
                <th>Created</th>
                <th>Settled</th>
                <th>Transaction hash</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="r row" style={{ animationDelay: `${Math.min(i, 12) * 0.04}s` }}>
                  <td style={{ padding: "15px 18px" }}>
                    <Link href={`/dashboard/requests/${r.reference}`} className="mono" style={{ fontWeight: 600 }}>
                      {r.reference}
                    </Link>
                  </td>
                  <td style={{ color: "#5B5876", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>{r.description ?? "—"}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{money(r.amount)}</td>
                  <td>
                    <StatusChip status={r.status} />
                  </td>
                  <td style={{ color: "#5B5876" }}>{when(r.createdAt)}</td>
                  <td style={{ color: "#5B5876" }}>{settled(r)}</td>
                  <td className="mono" style={{ fontSize: 13, color: "#5B5876" }}>
                    {r.paidTxHash ? shortHash(r.paidTxHash) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data && <div className="skel" style={{ height: 280, margin: 18 }} />}
        {data && rows.length === 0 && (
          <div style={{ padding: "48px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
            <span style={{ fontSize: 17, fontWeight: 800 }}>Nothing here</span>
            <span style={{ fontSize: 14, color: "#77748F" }}>{q ? `No request matches “${q}”.` : "No requests with this status yet."}</span>
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "14px 18px", fontSize: 13, fontWeight: 600, color: "#77748F" }}>
          <span>
            Showing {rows.length} of {total} request{total === 1 ? "" : "s"}
          </span>
          {hasMore && (
            <button type="button" className="btn alt" style={{ minHeight: 36 }} disabled={isValidating} onClick={() => void setSize(size + 1)}>
              Load more
            </button>
          )}
        </div>
      </section>
    </Page>
  );
}

export default function RequestsPage() {
  return (
    <Suspense>
      <Requests />
    </Suspense>
  );
}
