"use client";

import type { IncomingPayment, PaymentRequestDetail, RequestEvent } from "@moyapay/shared";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { Page } from "@/components/AppShell";
import { StatusChip } from "@/components/Chip";
import { CopyButton } from "@/components/CopyButton";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { api, ApiError, errorText, fetcher } from "@/lib/api";
import { explorerTx } from "@/lib/config";
import { clock, money, RESULT_CHIP, shortAddr, timeLeft, when } from "@/lib/format";

const CHECK_LABEL: Record<string, string> = {
  wallet: "Sent to your wallet",
  asset: "Asset",
  amount: "Amount",
  reference: "Reference",
  tx_success: "Transaction",
};
const LOOK = { ok: ["#E7F8EF", "#12B76A", "✓"], wait: ["#F6F5FB", "#B9B6CC", "…"], bad: ["#FEECEB", "#D92D20", "✕"] } as const;

function eventView(e: RequestEvent, payments: IncomingPayment[]): { dot: string; title: string; sub: string } {
  const d = e.data as Record<string, string | undefined>;
  const p = payments.find((x) => x.id === d.paymentId);
  const at = when(e.createdAt);
  switch (e.type) {
    case "CREATED":
      return { dot: "#12102A", title: "Request created", sub: `${at}${d.via === "api" ? " · via API" : ""}` };
    case "CHECKOUT_OPENED":
      return { dot: "#B9B6CC", title: "Checkout opened", sub: `${at} · payer link` };
    case "PAYMENT_SEEN":
      return {
        dot: "#5B3DF5",
        title: d.assignedManually ? "Payment assigned by hand" : "Payment seen",
        sub: `${clock(e.createdAt)}${p ? ` · ledger ${p.ledger.toLocaleString("en-US")}` : ""} · ${d.amount ? money(d.amount) : ""} ${d.asset ?? ""}`.trim(),
      };
    case "PAID":
      return { dot: "#12B76A", title: "Verified and marked Paid", sub: `${clock(e.createdAt)} · 5 of 5 checks` };
    case "FAILED":
      return { dot: "#D92D20", title: "Payment failed on Stellar", sub: `${clock(e.createdAt)} · ${(d.reason ?? "").replace(/^Transaction failed on Stellar /, "")}` };
    case "EXPIRED":
      return { dot: "#5B5876", title: "Expired", sub: `${at} · no valid payment` };
    case "DUPLICATE_IGNORED":
      return { dot: "#D92D20", title: "Duplicate ignored", sub: `${clock(e.createdAt)} · same transaction seen again` };
    case "FLAGGED": {
      const kind = d.result && d.result in RESULT_CHIP ? RESULT_CHIP[d.result as keyof typeof RESULT_CHIP][0] : "Payment flagged";
      return { dot: "#F5A524", title: `Flagged: ${kind.toLowerCase()}`, sub: `${clock(e.createdAt)} · ${d.reason ?? ""}` };
    }
  }
}

function VerifyNow({ reference, onDone }: { reference: string; onDone: () => void }) {
  const toast = useToast();
  const [hash, setHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          const res = await api<{ payments: { result: keyof typeof RESULT_CHIP; alreadyRecorded: boolean }[] }>(`/payment-requests/${reference}/verify`, {
            method: "POST",
            body: { txHash: hash.trim() },
          });
          const first = res.payments[0];
          toast(first ? `${RESULT_CHIP[first.result][0]}${first.alreadyRecorded ? " (already recorded)" : ""}` : "Checked", "info");
          setHash("");
          onDone();
        } catch (error) {
          setErr(error instanceof ApiError ? error.message : errorText(error));
        } finally {
          setBusy(false);
        }
      }}
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <label htmlFor="vh" className="k">
        Have a transaction hash? Check it now.
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <input id="vh" className="in mono" placeholder="64-character transaction hash" spellCheck={false} value={hash} onChange={(e) => setHash(e.target.value)} style={{ flex: "1 1 260px", height: 44, fontSize: 13 }} />
        <button type="submit" className="btn alt" disabled={busy || !/^[0-9a-fA-F]{64}$/.test(hash.trim())}>
          {busy && <span className="spin sm" />}Verify now
        </button>
      </div>
      {err && <span className="hint" style={{ color: "#B42318", fontWeight: 600 }}>{err}</span>}
    </form>
  );
}

export default function RequestDetail() {
  const { ref } = useParams<{ ref: string }>();
  const reference = decodeURIComponent(ref).toUpperCase();
  const { data: r, error, mutate } = useSWR<PaymentRequestDetail>(`/payment-requests/${reference}`, fetcher, {
    refreshInterval: (d) => (d && (d.status === "PAID" || d.status === "EXPIRED") ? 20_000 : 4000),
  });

  if (error instanceof ApiError && error.status === 404) {
    return (
      <Page>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>No request {reference}</h1>
        <Link href="/dashboard/requests">Back to payment requests</Link>
      </Page>
    );
  }
  if (!r) {
    return (
      <Page>
        <div className="skel" style={{ height: 40, width: 280 }} />
        <div className="skel" style={{ height: 420 }} />
      </Page>
    );
  }

  const link = typeof window === "undefined" ? r.payUrl : `${window.location.origin}/pay/${r.reference}`;
  const shown = r.verification ? r.payments.find((p) => p.id === r.verification?.paymentId) ?? null : null;
  const checks = r.verification?.checks ?? null;
  const passed = checks?.filter((c) => c.ok).length ?? 0;
  const second = r.payments.find((p) => p.result === "ALREADY_PAID");
  const left = timeLeft(r.expiresAt);
  const expiry: [string, string] =
    r.status === "PAID" && r.paidAt
      ? ["Paid at", when(r.paidAt)]
      : r.status === "EXPIRED" && r.expiresAt
        ? ["Expired", when(r.expiresAt)]
        : r.expiresAt
          ? ["Expires", left ? `in ${left}` : "now"]
          : ["Expires", "Never"];
  const checkRows = checks
    ? checks.map((c) => ({ label: CHECK_LABEL[c.key] ?? c.label, value: c.key === "reference" ? `memo ${c.value}` : c.key === "wallet" ? shortAddr(c.value) : c.value, st: c.ok ? "ok" : "bad" }) as const)
    : Object.values(CHECK_LABEL).map((label) => ({ label, value: r.status === "EXPIRED" ? "no payment" : "waiting", st: "wait" }) as const);

  return (
    <Page>
      <nav aria-label="Breadcrumb" className="rise" style={{ fontSize: 13, fontWeight: 600, color: "#77748F" }}>
        <Link href="/dashboard/requests">Payment requests</Link> / <span className="mono">{r.reference}</span>
      </nav>
      <header className="rise" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
        <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
            <h1 className="mono" style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: "0.01em" }}>
              {r.reference}
            </h1>
            <StatusChip key={r.status} status={r.status} large className="popBig" />
          </div>
          <span style={{ fontSize: 14, color: "#77748F" }}>
            {r.description ?? "Payment request"} · created {when(r.createdAt)}
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <a href={`/pay/${r.reference}`} target="_blank" rel="noopener" className="btn alt" style={{ minHeight: 42 }}>
            Open checkout
          </a>
          <CopyButton text={link} label="Copy pay link" className="btn" style={{ minHeight: 42 }} />
        </div>
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: "999 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          <section className="card rise d1" aria-label="Request" style={{ padding: 22, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 18 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="k">Amount</span>
              <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.045em" }}>
                {money(r.amount)} <span style={{ fontSize: 15, color: "#77748F" }}>USDC</span>
              </span>
              <span className="mono" style={{ fontSize: 12, color: "#77748F" }}>
                {r.amount} exact
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="k">Asset</span>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{r.asset.code}</span>
              <span className="mono" style={{ fontSize: 12, color: "#77748F" }}>
                {r.asset.issuer ? shortAddr(r.asset.issuer) : "native"}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="k">{expiry[0]}</span>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{expiry[1]}</span>
            </div>
            <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="k">Receive to</span>
              <span className="mono" style={{ fontSize: 14, fontWeight: 500, wordBreak: "break-all" }}>
                {r.destination}
              </span>
            </div>
          </section>

          <section className="card rise d2" aria-labelledby="checks" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2 id="checks" style={{ margin: 0, flexGrow: 1, fontSize: 17, fontWeight: 800 }}>
                Verification
              </h2>
              <span className="k">{checks ? `${passed} of 5 passed` : "nothing received yet"}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              {checkRows.map((c, i) => {
                const [bg, dot, icon] = LOOK[c.st];
                return (
                  <div key={c.label} className="pop" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, background: bg, animationDelay: `${i * 0.08}s` }}>
                    <span style={{ flex: "0 0 auto", width: 28, height: 28, borderRadius: "50%", background: dot, color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800 }}>{icon}</span>
                    <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{c.label}</span>
                      <span className="mono" style={{ fontSize: 12, color: "#5B5876", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.value}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {(r.status === "PENDING" || r.status === "FAILED") && <VerifyNow reference={r.reference} onDone={() => void mutate()} />}
          </section>

          {shown && (
            <section className="card rise d3" aria-labelledby="tx" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h2 id="tx" style={{ margin: 0, flexGrow: 1, fontSize: 17, fontWeight: 800 }}>
                  {shown.result === "MATCHED" ? "Matched transaction" : shown.txSuccessful ? "Latest transaction" : "Failed transaction"}
                </h2>
                <a href={explorerTx(shown.txHash)} target="_blank" rel="noopener" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 700 }}>
                  Stellar Expert
                  <Icon name="external" size={14} stroke={2.6} />
                </a>
              </div>
              <div style={{ padding: "14px 16px", borderRadius: 14, background: "#F6F5FB", display: "flex", alignItems: "center", gap: 12 }}>
                <span className="mono" style={{ flexGrow: 1, minWidth: 0, fontSize: 13, fontWeight: 500, wordBreak: "break-all" }}>
                  {shown.txHash}
                </span>
                <CopyButton text={shown.txHash} iconOnly ariaLabel="Copy hash" className="btn alt" style={{ minHeight: 38, padding: "0 12px" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, fontSize: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span className="k">From</span>
                  <span className="mono" style={{ fontWeight: 600 }}>{shortAddr(shown.from)}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span className="k">Ledger</span>
                  <span className="mono" style={{ fontWeight: 600 }}>{shown.ledger.toLocaleString("en-US")}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span className="k">Memo</span>
                  <span className="mono" style={{ fontWeight: 600 }}>{shown.memo ?? "—"}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span className="k">Result</span>
                  <span style={{ fontWeight: 700, color: shown.result === "MATCHED" ? "#067647" : "#B42318" }}>
                    {shown.result === "MATCHED" ? "Successful · counted once" : shown.reason}
                  </span>
                </div>
              </div>
            </section>
          )}
        </div>

        <aside className="card rise d3" aria-labelledby="tl" style={{ flex: "1 1 300px", minWidth: 0, padding: 22 }}>
          <h2 id="tl" style={{ margin: "0 0 16px", fontSize: 17, fontWeight: 800 }}>
            Timeline
          </h2>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, position: "relative" }}>
            <span aria-hidden="true" className="vline" style={{ position: "absolute", left: 13, top: 8, bottom: 8, width: 2, background: "#ECEAF5" }} />
            {r.events.map((e) => {
              const v = eventView(e, r.payments);
              return (
                <li key={e.id} style={{ position: "relative", display: "flex", gap: 14, padding: "0 0 18px" }}>
                  <span style={{ position: "relative", flex: "0 0 auto", width: 28, height: 28, borderRadius: "50%", background: v.dot, border: "4px solid #FFFFFF", boxShadow: "0 0 0 1px #ECEAF5" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 3, minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{v.title}</span>
                    <span style={{ fontSize: 13, color: "#77748F", wordBreak: "break-word" }}>{v.sub}</span>
                  </div>
                </li>
              );
            })}
            {(r.status === "PENDING" || r.status === "FAILED") && (
              <li style={{ position: "relative", display: "flex", gap: 14, padding: "0 0 4px" }}>
                <span style={{ position: "relative", flex: "0 0 auto", width: 28, height: 28, borderRadius: "50%", background: "#FFFFFF", border: "4px solid #FFFFFF", boxShadow: "0 0 0 1px #ECEAF5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span className="live" />
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 3 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{r.status === "FAILED" ? "Still open for retry" : "Watching for payment"}</span>
                  <span style={{ fontSize: 13, color: "#77748F" }}>{r.expiresAt ? `expires ${when(r.expiresAt)}` : "never expires"}</span>
                </div>
              </li>
            )}
          </ol>
          {second && (
            <div style={{ marginTop: 4, padding: 14, borderRadius: 14, background: "#FEECEB", display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#B42318" }}>Second payment flagged</span>
              <span style={{ fontSize: 13, lineHeight: 1.45, color: "#7A1D15" }}>
                Another {money(second.amount)} arrived with this reference. It wasn't counted.{" "}
                <Link href={`/dashboard/reconciliation?id=${second.id}`} style={{ color: "#7A1D15", fontWeight: 700, textDecoration: "underline" }}>
                  Refund it from Reconciliation.
                </Link>
              </span>
            </div>
          )}
        </aside>
      </div>
    </Page>
  );
}
