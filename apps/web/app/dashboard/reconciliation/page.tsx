"use client";

import type { IncomingPayment, Page as ApiPage, TransactionCounts, TransactionDetail, TransactionView } from "@moyapay/shared";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { Page, PageHeader } from "@/components/AppShell";
import { ResultChip, StatusChip } from "@/components/Chip";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { API, api, errorText, fetcher } from "@/lib/api";
import { explorerTx, USDC_ISSUER } from "@/lib/config";
import { clock, money, shortAddr, tinyHash, when } from "@/lib/format";

type ListPage = ApiPage<IncomingPayment> & { counts: TransactionCounts };
const DOT = { ok: ["#12B76A", "✓"], bad: ["#D92D20", "✕"], wait: ["#B9B6CC", "–"] } as const;

function amountOf(p: IncomingPayment): string {
  return `${money(p.amount)} ${p.asset.code}`;
}

/** Checks for a payment with no linked request: what we can still tell from the payment alone. */
function looseChecks(p: IncomingPayment) {
  const usdc = p.asset.code === "USDC" && p.asset.issuer === USDC_ISSUER;
  return [
    { label: "Sent to your wallet", st: "ok" as const },
    { label: "Asset USDC", st: usdc ? ("ok" as const) : ("bad" as const) },
    { label: "Amount", st: "wait" as const },
    { label: "Reference", st: "bad" as const },
    { label: "Transaction succeeded", st: p.txSuccessful ? ("ok" as const) : ("bad" as const) },
  ];
}

function Panel({ id, onChanged }: { id: string; onChanged: () => void }) {
  const toast = useToast();
  const { data: p, mutate } = useSWR<TransactionDetail>(`/transactions/${id}`, fetcher);
  const [assigning, setAssigning] = useState(false);
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!p) return <div className="skel" style={{ height: 320 }} />;
  const review = p.resolution === "NONE" && p.result !== "MATCHED" && p.result !== "FAILED_TX";
  const checks = p.checks
    ? p.checks.map((c) => ({ label: c.key === "asset" ? "Asset USDC" : c.label, st: c.ok ? ("ok" as const) : ("bad" as const) }))
    : looseChecks(p);

  async function resolve(body: Record<string, string>, done: string) {
    setBusy(true);
    setErr(null);
    try {
      await api(`/transactions/${id}`, { method: "PATCH", body });
      await mutate();
      onChanged();
      setAssigning(false);
      toast(done);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="card inR" aria-label="Payment detail" style={{ flex: "1 1 320px", minWidth: 0, overflow: "hidden" }}>
      <div style={{ padding: 20, background: "linear-gradient(135deg, #F3F0FF, #FFFFFF)", borderBottom: "1px solid #ECEAF5", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <ResultChip result={p.result} />
          {p.resolution !== "NONE" && <span className="chip off">{p.resolution === "ASSIGNED" ? "Assigned" : p.resolution === "REFUNDED" ? "Refunded" : "Ignored"}</span>}
          <a href={explorerTx(p.txHash)} target="_blank" rel="noopener" className="mono" style={{ fontSize: 13, color: "#5B5876" }}>
            {tinyHash(p.txHash)} ↗
          </a>
        </div>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.045em" }}>{amountOf(p)}</div>
      </div>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: "#3B3856" }}>{p.reason}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 9, padding: 14, borderRadius: 14, background: "#F6F5FB", fontSize: 13 }}>
          {checks.map((c) => (
            <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ flex: "0 0 auto", width: 20, height: 20, borderRadius: "50%", background: DOT[c.st][0], color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>{DOT[c.st][1]}</span>
              <span style={{ flexGrow: 1, fontWeight: 600 }}>{c.label}</span>
              <span className="mono" style={{ color: "#5B5876" }}>
                {c.st === "ok" ? "pass" : c.st === "bad" ? "fail" : "n/a"}
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span className="k">From</span>
            <span className="mono" style={{ fontWeight: 600 }}>{shortAddr(p.from)}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span className="k">Memo</span>
            <span className="mono" style={{ fontWeight: 600, wordBreak: "break-all" }}>{p.memo ?? "—"}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span className="k">Ledger</span>
            <span className="mono" style={{ fontWeight: 600 }}>{p.ledger.toLocaleString("en-US")}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span className="k">Closed</span>
            <span style={{ fontWeight: 600 }}>{when(p.ledgerClosedAt)}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#77748F" }}>Linked request</span>
          {p.request ? (
            <Link href={`/dashboard/requests/${p.request.reference}`} className="mono" style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
              {p.request.reference} <StatusChip status={p.request.status} />
            </Link>
          ) : (
            <span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>None</span>
          )}
          {p.resolutionNote && <span className="hint">Note: {p.resolutionNote}</span>}
        </div>
        {err && (
          <div className="alert bad shake" role="alert">
            <span>{err}</span>
          </div>
        )}
        {review && !assigning && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {p.result === "UNMATCHED" && p.txSuccessful && (
              <button type="button" className="btn" style={{ flex: "1 1 140px" }} onClick={() => setAssigning(true)}>
                Assign to a request
              </button>
            )}
            <button type="button" className="btn alt" style={{ flex: "1 1 120px" }} disabled={busy} onClick={() => void resolve({ resolution: "REFUNDED" }, "Marked refunded")}>
              Mark refunded
            </button>
            <button type="button" className="btn alt" style={{ flex: "1 1 100px" }} disabled={busy} onClick={() => void resolve({ resolution: "IGNORED" }, "Ignored")}>
              Ignore
            </button>
          </div>
        )}
        {assigning && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void resolve({ resolution: "ASSIGNED", requestRef: ref.trim() }, "Assigned and marked Paid");
            }}
            style={{ display: "flex", flexDirection: "column", gap: 8 }}
          >
            <label htmlFor="aref" className="lbl">
              Which request is it for?
            </label>
            <input id="aref" className="in mono" placeholder="MP-XXXXXX" autoFocus value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} />
            <span className="hint">It must ask for exactly {amountOf(p)} at this address, and still be open.</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="btn" disabled={busy || ref.trim().length < 9} style={{ flex: 1 }}>
                {busy && <span className="spin sm" />}Assign
              </button>
              <button type="button" className="btn alt" onClick={() => setAssigning(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
        {(p.resolution === "REFUNDED" || p.resolution === "IGNORED") && (
          <button type="button" className="btn alt" disabled={busy} onClick={() => void resolve({ resolution: "NONE" }, "Reopened")}>
            Reopen
          </button>
        )}
      </div>
    </aside>
  );
}

const TABS: [TransactionView, string, keyof TransactionCounts][] = [
  ["all", "All", "all"],
  ["needs_review", "Needs review", "needsReview"],
  ["matched", "Matched", "matched"],
  ["ignored", "Ignored", "ignored"],
];

function Reconciliation() {
  const router = useRouter();
  const params = useSearchParams();
  const view = (params.get("view") as TransactionView | null) ?? "all";
  const [sel, setSel] = useState<string | null>(params.get("id"));
  const { data, size, setSize, mutate, isValidating } = useSWRInfinite<ListPage>(
    (i, prev: ListPage | null) =>
      i > 0 && !prev?.nextCursor ? null : `/transactions?view=${view}&limit=30${i > 0 && prev?.nextCursor ? `&cursor=${prev.nextCursor}` : ""}`,
    fetcher,
    { refreshInterval: 8000 },
  );
  const rows = data?.flatMap((p) => p.data) ?? [];
  const counts = data?.[0]?.counts;
  const selected = sel ?? rows.find((r) => r.resolution === "NONE" && r.result !== "MATCHED")?.id ?? rows[0]?.id ?? null;
  const hasMore = Boolean(data?.[data.length - 1]?.nextCursor);

  return (
    <Page>
      <PageHeader title="Reconciliation" sub="Every payment that reached your wallet, and what we did with it.">
        <a href={`${API}/transactions?format=csv&view=${view}`} download className="btn alt">
          <Icon name="download" size={16} stroke={2.4} />
          Export records
        </a>
      </PageHeader>

      <section aria-label="Summary" className="rise d1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        {[
          ["Seen today", counts?.seenToday, "#77748F", false],
          ["Matched", counts?.matched, "#067647", false],
          ["Needs review", counts?.needsReview, "#4527D9", true],
          ["Duplicates ignored", counts?.duplicatesIgnored, "#77748F", false],
        ].map(([label, n, color, hi]) => (
          <div
            key={label as string}
            className="card"
            style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 4, ...(hi ? { background: "#F3F0FF", borderColor: "#DDD5FF" } : {}) }}
          >
            <span style={{ fontSize: 13, fontWeight: hi ? 700 : 600, color: color as string }}>{label as string}</span>
            <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em" }}>{n ?? "…"}</span>
          </div>
        ))}
      </section>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        <section className="card rise d2" style={{ flex: "999 1 560px", minWidth: 0, overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #ECEAF5" }}>
            <div role="tablist" aria-label="Filter" className="tabs" style={{ display: "inline-flex" }}>
              {TABS.map(([k, label, key]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  className="tab"
                  aria-selected={view === k}
                  onClick={() => {
                    setSel(null);
                    router.replace(`/dashboard/reconciliation${k === "all" ? "" : `?view=${k}`}`);
                  }}
                >
                  {label} · {counts ? (counts[key] as number) : "…"}
                </button>
              ))}
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ padding: "12px 14px" }}>Time</th>
                  <th style={{ padding: "12px 14px" }}>Transaction</th>
                  <th style={{ padding: "12px 14px" }}>From</th>
                  <th style={{ padding: "12px 14px", textAlign: "right" }}>Amount</th>
                  <th style={{ padding: "12px 14px" }}>Memo</th>
                  <th style={{ padding: "12px 14px" }}>Result</th>
                  <th style={{ padding: "12px 14px" }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className={`r row ${r.id === selected ? "sel" : ""}`} style={{ animationDelay: `${Math.min(i, 12) * 0.04}s` }}>
                    <td style={{ padding: "13px 14px", color: "#5B5876" }} title={when(r.createdAt)}>
                      {clock(r.ledgerClosedAt)}
                    </td>
                    <td className="mono" style={{ padding: "13px 14px", fontSize: 13 }}>
                      {tinyHash(r.txHash)}
                    </td>
                    <td className="mono" style={{ padding: "13px 14px", fontSize: 13, color: "#5B5876" }}>
                      {shortAddr(r.from)}
                    </td>
                    <td style={{ padding: "13px 14px", textAlign: "right", fontWeight: 700 }}>{amountOf(r)}</td>
                    <td className="mono" style={{ padding: "13px 14px", fontSize: 13, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.memo ?? "—"}
                    </td>
                    <td style={{ padding: "13px 14px" }}>
                      <ResultChip result={r.result} />
                    </td>
                    <td style={{ padding: "13px 14px", textAlign: "right" }}>
                      <button type="button" className="pick" onClick={() => setSel(r.id)} aria-label={`Open ${tinyHash(r.txHash)}`}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data && <div className="skel" style={{ height: 300, margin: 18 }} />}
          {data && rows.length === 0 && (
            <div style={{ padding: "48px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
              <span style={{ fontSize: 17, fontWeight: 800 }}>{view === "needs_review" ? "All clear" : "No payments yet"}</span>
              <span style={{ fontSize: 14, color: "#77748F" }}>
                {view === "needs_review" ? "Every payment matched its request." : "Payments to your wallet show up here as soon as they land."}
              </span>
            </div>
          )}
          {hasMore && (
            <div style={{ padding: 14, display: "flex", justifyContent: "center" }}>
              <button type="button" className="btn alt" disabled={isValidating} onClick={() => void setSize(size + 1)}>
                Load more
              </button>
            </div>
          )}
        </section>
        {selected && <Panel key={selected} id={selected} onChanged={() => void mutate()} />}
      </div>
    </Page>
  );
}

export default function ReconciliationPage() {
  return (
    <Suspense>
      <Reconciliation />
    </Suspense>
  );
}
