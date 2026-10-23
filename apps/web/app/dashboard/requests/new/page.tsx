"use client";

import { EXPIRY_PRESETS, type AccountCheck, type PaymentRequest } from "@moyapay/shared";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { MerchantAvatar } from "@/components/AppShell";
import { StatusChip } from "@/components/Chip";
import { CopyButton } from "@/components/CopyButton";
import { Icon } from "@/components/Icon";
import { Qr } from "@/components/Qr";
import { api, ApiError, errorText, fetcher } from "@/lib/api";
import { USDC_ISSUER } from "@/lib/config";
import { money, shortAddr } from "@/lib/format";
import { useSession } from "@/lib/session";

type Expiry = keyof typeof EXPIRY_PRESETS | "never";
const EXPIRIES: [Expiry, string, string][] = [
  ["1h", "1 hour", "1 hour"],
  ["24h", "24 hours", "24 hours"],
  ["7d", "7 days", "7 days"],
  ["never", "Never", "no limit"],
];
const AMOUNT = /^\d{1,12}(\.\d{1,7})?$/;
const ADDRESS = /^G[A-Z2-7]{55}$/;

function TrustlineHint({ address, own }: { address: string; own: boolean }) {
  const valid = ADDRESS.test(address);
  const { data, error, isLoading } = useSWR<AccountCheck>(valid ? `/accounts/${address}` : null, fetcher);
  if (!address) return <span className="hint">The Stellar account that receives the USDC.</span>;
  if (!valid) return <span className="hint" style={{ color: "#B42318", fontWeight: 600 }}>That isn't a Stellar account address (G…, 56 characters).</span>;
  if (isLoading) return <span className="hint">Checking it on Stellar…</span>;
  if (error || !data) return <span className="hint" style={{ color: "#9A5B00", fontWeight: 600 }}>Couldn't check this account right now.</span>;
  if (!data.exists) return <span className="hint" style={{ color: "#B42318", fontWeight: 600 }}>This account isn't funded on Testnet yet.</span>;
  if (!data.usdcTrustline) return <span className="hint" style={{ color: "#B42318", fontWeight: 600 }}>This account has no USDC trustline, so it can't receive USDC.</span>;
  return (
    <span className="hint" style={{ display: "flex", alignItems: "center", gap: 6, color: "#067647", fontWeight: 600 }}>
      <Icon name="check" size={14} stroke={3} />
      {own ? "Your wallet" : "This account"} · can receive USDC
    </span>
  );
}

export default function NewRequest() {
  const { merchant } = useSession();
  const [destination, setDestination] = useState(merchant.walletAddress);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [exp, setExp] = useState<Expiry>("24h");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [created, setCreated] = useState<PaymentRequest | null>(null);

  const amountOk = AMOUNT.test(amount.trim()) && /[1-9]/.test(amount);
  const amountShown = amountOk ? money(amount.trim()) : "0.00";
  const expiryLabel = EXPIRIES.find((e) => e[0] === exp)?.[2] ?? "";

  async function create() {
    if (!amountOk) return setError({ field: "amount", message: "Enter an amount greater than 0, with up to 7 decimals." });
    setBusy(true);
    try {
      const req = await api<PaymentRequest>("/payment-requests", {
        method: "POST",
        body: {
          amount: amount.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
          ...(destination.trim() !== merchant.walletAddress ? { destination: destination.trim() } : {}),
          expiresIn: exp === "never" ? null : EXPIRY_PRESETS[exp],
        },
      });
      setCreated(req);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      setError({ field: ["NO_TRUSTLINE", "ACCOUNT_NOT_FOUND", "DESTINATION_CLAIMED"].includes(code) ? "destination" : undefined, message: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  function again() {
    setCreated(null);
    setAmount("");
    setDescription("");
  }

  return (
    <div style={{ padding: "28px clamp(16px, 3vw, 32px) 48px", display: "flex", flexDirection: "column", gap: 22 }}>
      <header className="rise" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <Link
          href="/dashboard/requests"
          aria-label="Back to requests"
          style={{ width: 42, height: 42, borderRadius: 12, background: "#FFFFFF", border: "1px solid #ECEAF5", color: "#12102A", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="back" stroke={2.4} />
        </Link>
        <h1 style={{ margin: 0, fontSize: 28, letterSpacing: "-0.04em", fontWeight: 800 }}>New payment request</h1>
      </header>

      {!created ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 22, alignItems: "flex-start" }}>
          <form
            className="card rise d1"
            style={{ flex: "999 1 460px", minWidth: 0, padding: 26, display: "flex", flexDirection: "column", gap: 22 }}
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label htmlFor="dest" className="lbl">
                Receive to
              </label>
              <input
                id="dest"
                className={`in mono ${error?.field === "destination" ? "err" : ""}`}
                type="text"
                spellCheck={false}
                autoComplete="off"
                value={destination}
                onChange={(e) => {
                  setError(null);
                  setDestination(e.target.value.trim().toUpperCase());
                }}
                style={{ fontSize: 13 }}
              />
              <TrustlineHint address={destination} own={destination === merchant.walletAddress} />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
              <div style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: 8 }}>
                <label htmlFor="amt" className="lbl">
                  Amount
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    id="amt"
                    className={`in ${error?.field === "amount" ? "err" : ""}`}
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    autoFocus
                    value={amount}
                    onChange={(e) => {
                      setError(null);
                      setAmount(e.target.value.replace(",", "."));
                    }}
                    style={{ height: 56, fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em", paddingRight: 80 }}
                  />
                  <span style={{ position: "absolute", right: 14, top: 18, fontSize: 14, fontWeight: 800, color: "#77748F" }}>USDC</span>
                </div>
              </div>
              <div style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: 8 }}>
                <span className="lbl">Asset</span>
                <div style={{ height: 56, padding: "0 14px", borderRadius: 12, background: "#F6F5FB", border: "1px solid #ECEAF5", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 28, height: 28, borderRadius: "50%", background: "#2775CA", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800 }}>$</span>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>USDC</span>
                  <span className="mono" style={{ marginLeft: "auto", fontSize: 12, color: "#77748F" }}>
                    {shortAddr(USDC_ISSUER)}
                  </span>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label htmlFor="desc" className="lbl">
                What it's for <span style={{ fontWeight: 500, color: "#77748F" }}>(the payer sees this)</span>
              </label>
              <input id="desc" className="in" type="text" maxLength={140} placeholder="e.g. Wedding cake deposit" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span className="lbl" id="exp-l">
                Expires after
              </span>
              <div role="radiogroup" aria-labelledby="exp-l" style={{ display: "flex", flexWrap: "wrap", gap: 2, padding: 3, borderRadius: 12, background: "#F6F5FB", border: "1px solid #ECEAF5" }}>
                {EXPIRIES.map(([k, label]) => (
                  <button key={k} type="button" role="radio" className="seg" aria-checked={exp === k} onClick={() => setExp(k)}>
                    {label}
                  </button>
                ))}
              </div>
              <span className="hint">After that it turns Expired, and late payments go to Reconciliation.</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 14, background: "#F3F0FF" }}>
              <Icon name="hash" size={20} stroke={2.2} color="#5B3DF5" style={{ flex: "0 0 auto" }} />
              <span style={{ fontSize: 14, lineHeight: 1.5, fontWeight: 600, color: "#3A2C8F" }}>
                We'll make a unique reference like <span className="mono">MP-W3K8TD</span>. It goes in the payment memo so we can match it.
              </span>
            </div>
            {error && (
              <div className="alert bad shake" role="alert">
                <Icon name="warn" size={18} stroke={2.4} color="#B42318" style={{ flex: "0 0 auto" }} />
                <span>{error.message}</span>
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <button type="submit" className="btn" disabled={busy} style={{ flex: "1 1 220px" }}>
                {busy && <span className="spin sm" />}Create request
              </button>
              <Link href="/dashboard/requests" className="btn alt" style={{ flex: "0 1 140px" }}>
                Cancel
              </Link>
            </div>
          </form>

          <aside className="rise d2" aria-label="Checkout preview" style={{ flex: "1 1 340px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            <span className="hint" style={{ fontWeight: 700 }}>
              What your customer sees
            </span>
            <div style={{ borderRadius: 28, padding: 10, background: "radial-gradient(120% 120% at 100% 0%, #8B6CFF, #5B3DF5 50%, #2E17A8)" }}>
              <div style={{ borderRadius: 20, background: "#FFFFFF", padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <MerchantAvatar name={merchant.name} size={38} />
                  <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 800 }}>{merchant.name}</span>
                    <span style={{ fontSize: 12, color: "#77748F", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{description.trim() || "Payment request"}</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span className="hint">Amount due</span>
                  <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.05em" }}>
                    {amountShown} <span style={{ fontSize: 18, color: "#77748F" }}>USDC</span>
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 12, background: "#F6F5FB", fontSize: 13, fontWeight: 600 }}>
                  <span style={{ color: "#77748F" }}>Expires in</span>
                  <span>{expiryLabel}</span>
                </div>
                <div style={{ height: 50, borderRadius: 13, background: "#5B3DF5", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700 }}>
                  Pay with wallet
                </div>
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <Created req={created} expiryLabel={expiryLabel} onAgain={again} />
      )}
    </div>
  );
}

function Created({ req, expiryLabel, onAgain }: { req: PaymentRequest; expiryLabel: string; onAgain: () => void }) {
  const link = typeof window === "undefined" ? req.payUrl : `${window.location.origin}/pay/${req.reference}`;
  return (
    <section className="card pop" style={{ maxWidth: 780, overflow: "hidden" }}>
      <div style={{ padding: "28px 32px", background: "radial-gradient(120% 160% at 100% 0%, #8B6CFF, #5B3DF5 50%, #3A1FC4)", color: "#FFFFFF", display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ width: 52, height: 52, flex: "0 0 auto", borderRadius: 16, background: "#FFFFFF", color: "#5B3DF5", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="check" size={26} stroke={2.8} style={{ strokeDasharray: 30, animation: "drawCheck .5s .3s ease-out both" }} />
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em" }}>Request created</h2>
          <span style={{ fontSize: 14, color: "#E4DDFF" }}>Share the link. We'll mark it Paid by ourselves.</span>
        </div>
      </div>
      <div style={{ padding: "28px clamp(18px, 4vw, 32px)", display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 22, alignItems: "center" }}>
          <div style={{ flex: "999 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="hint">Reference</span>
              <span className="mono" style={{ fontSize: 30, fontWeight: 600, letterSpacing: "0.02em" }}>
                {req.reference}
              </span>
            </div>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", fontSize: 15, fontWeight: 700 }}>
              <span>{money(req.amount)} USDC</span>
              <span style={{ color: "#77748F" }}>{req.expiresAt ? `Expires in ${expiryLabel}` : "Never expires"}</span>
              <StatusChip status={req.status} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 6px 6px 14px", borderRadius: 13, border: "1px solid #E4E2EE", background: "#F6F5FB" }}>
              <span className="mono" style={{ flexGrow: 1, minWidth: 0, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {link.replace(/^https?:\/\//, "")}
              </span>
              <CopyButton text={link} label="Copy link" className="btn" style={{ minHeight: 38, fontSize: 13, padding: "0 14px" }} />
            </div>
          </div>
          <Qr value={link} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Link href={`/dashboard/requests/${req.reference}`} className="btn">
            View request
          </Link>
          <a href={`/pay/${req.reference}`} target="_blank" rel="noopener" className="btn alt">
            Open checkout
          </a>
          <button type="button" className="btn alt" onClick={onAgain}>
            Make another
          </button>
        </div>
      </div>
    </section>
  );
}
