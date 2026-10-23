"use client";

import type { Checkout } from "@moyapay/shared";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, useRef, useState } from "react";
import useSWR from "swr";
import { MerchantAvatar, useNow } from "@/components/AppShell";
import { copyText, CopyButton } from "@/components/CopyButton";
import { Icon } from "@/components/Icon";
import { WalletLogo } from "@/components/WalletLogo";
import { useToast } from "@/components/Toast";
import { api, ApiError, errorText, fetcher } from "@/lib/api";
import { money, percentOf, ringLabel, shortAddr, shortfall, when } from "@/lib/format";
import { addUsdcTrustline, loadPayer, PayError, payRequest, type PayerAccount } from "@/lib/stellar-pay";
import { connect, listWallets, WalletError, type WalletOption } from "@/lib/wallet";
import { demoCheckout } from "../_components/demo";
import { Frame, TestnetNote } from "../_components/Frame";

type Step =
  | { kind: "pay" }
  | { kind: "wallets" }
  | { kind: "sign"; wallet: WalletOption; note?: string }
  | { kind: "trust"; wallet: WalletOption; payer: PayerAccount }
  | { kind: "detect"; hash: string | null; note?: string };

const noop = () => () => undefined;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Ring({ c, now }: { c: Checkout; now: number }) {
  const total = c.expiresAt ? new Date(c.expiresAt).getTime() - new Date(c.createdAt).getTime() : 0;
  const elapsed = c.expiresAt ? Math.min(total, Math.max(0, now - new Date(c.createdAt).getTime())) : 0;
  const offset = total > 0 ? (113 * elapsed) / total : 0;
  const label = ringLabel(c.expiresAt, now);
  return (
    <span style={{ position: "relative", width: 44, height: 44, flex: "0 0 auto" }} role="img" aria-label={c.expiresAt ? `Expires ${when(c.expiresAt)}` : "Never expires"}>
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r="18" fill="none" stroke="#F1F0F7" strokeWidth={4} />
        <circle cx="22" cy="22" r="18" fill="none" stroke="#5B3DF5" strokeWidth={4} strokeLinecap="round" strokeDasharray="113" strokeDashoffset={offset} transform="rotate(-90 22 22)" style={{ transition: "stroke-dashoffset 1s linear" }} />
      </svg>
      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>{label}</span>
    </span>
  );
}

function Summary({ c, now }: { c: Checkout; now: number }) {
  return (
    <section className="card rise" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 24px 50px -24px rgba(20, 8, 90, 0.5)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <MerchantAvatar name={c.merchant.name} size={44} />
        <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>{c.merchant.name}</span>
          <span style={{ fontSize: 13, color: "#77748F", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.description ?? "Payment request"}</span>
        </div>
        <Ring c={c} now={now} />
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#77748F" }}>Amount due</span>
          <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-0.055em", lineHeight: 1 }}>
            {money(c.amount)} <span style={{ fontSize: 18, color: "#77748F" }}>USDC</span>
          </span>
        </div>
        <span className="mono" style={{ fontSize: 12, color: "#5B5876", padding: "4px 8px", borderRadius: 8, background: "#F6F5FB" }}>
          {c.reference}
        </span>
      </div>
    </section>
  );
}

function Issue({ c, kind, onBack }: { c: Checkout; kind: "expired" | "wrong" | "failed"; onBack: () => void }) {
  const toast = useToast();
  const last = c.lastPayment;
  const M = {
    expired: ["This link has expired", "It's no longer open for payment. Ask the merchant for a new one, and please don't pay this one.", "Ask for a new link", "#F0EFF5", "#5B5876"],
    wrong: ["That wasn't the full amount", "We got your payment, but it doesn't match the request, so it isn't marked Paid yet.", "Back to checkout", "#FFF4E0", "#9A5B00"],
    failed: ["Your payment failed", "Stellar rejected the transaction. You weren't charged the payment, only the tiny network fee.", "Try again", "#FEECEB", "#B42318"],
  }[kind];
  const code = last?.resultCodes?.operations.find((o) => o !== "op_success") ?? last?.resultCodes?.transaction ?? c.failedReason?.match(/\((.*)\)/)?.[1] ?? "tx_failed";
  return (
    <Frame
      band={false}
      footer={
        <>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              if (kind !== "expired") return onBack();
              const ok = await copyText(`Hi ${c.merchant.name}, my MoyaPay link ${c.reference} for ${money(c.amount)} USDC expired. Could you send me a new one?`);
              toast(ok ? "Message copied. Send it to the merchant." : "Couldn't copy", ok ? "ok" : "bad");
            }}
          >
            {M[2]}
          </button>
          <TestnetNote />
        </>
      }
    >
      <div style={{ paddingTop: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 18, textAlign: "center" }}>
        <span className="shake" style={{ width: 84, height: 84, borderRadius: "50%", background: M[3], color: M[4], display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={kind === "expired" ? "clock" : "warn"} size={40} stroke={2.2} />
        </span>
        <div className="rise d2" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 style={{ margin: 0, fontSize: 30, letterSpacing: "-0.045em", fontWeight: 800 }}>{M[0]}</h1>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: "#5B5876", maxWidth: 320 }}>{M[1]}</p>
        </div>
        <section className="rise d3" style={{ width: "100%", padding: 18, borderRadius: 20, background: "#FFFFFF", border: "1px solid #ECEAF5", display: "flex", flexDirection: "column", gap: 12, textAlign: "left" }}>
          <div className="r">
            <span style={{ color: "#77748F" }}>Request</span>
            <span className="mono" style={{ fontWeight: 600 }}>{c.reference}</span>
          </div>
          <div className="r">
            <span style={{ color: "#77748F" }}>Asked for</span>
            <span style={{ fontWeight: 700 }}>{money(c.amount)} USDC</span>
          </div>
          {kind === "wrong" && last && (
            <>
              <div className="r">
                <span style={{ color: "#77748F" }}>You sent</span>
                <span style={{ fontWeight: 700, color: "#B42318" }}>
                  {money(last.amount)} {last.asset.code}
                </span>
              </div>
              <div style={{ height: 10, borderRadius: 999, background: "#F1F0F7", overflow: "hidden" }}>
                <div className="bar" style={{ width: `${percentOf(last.amount, c.amount)}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #7C5CFF, #5B3DF5)" }} />
              </div>
              <span style={{ fontSize: 13, color: "#5B5876" }}>
                {shortfall(last.amount, c.amount).startsWith("-") ? `${shortfall(last.amount, c.amount).slice(1)} too much.` : `${shortfall(last.amount, c.amount)} short.`} Your {money(last.amount)} is held for the merchant to sort out.
              </span>
            </>
          )}
          {kind === "expired" && c.expiresAt && (
            <div className="r">
              <span style={{ color: "#77748F" }}>Expired</span>
              <span style={{ fontWeight: 700 }}>{when(c.expiresAt)}</span>
            </div>
          )}
          {kind === "failed" && (
            <>
              <div className="r">
                <span style={{ color: "#77748F" }}>Stellar said</span>
                <span className="mono" style={{ fontWeight: 600, color: "#B42318" }}>{code}</span>
              </div>
              <span style={{ fontSize: 13, color: "#5B5876" }}>{code === "op_underfunded" ? "Nothing left your wallet. Top up USDC and try again." : "Nothing left your wallet. Check your wallet and try again."}</span>
            </>
          )}
        </section>
      </div>
    </Frame>
  );
}

const CHECKS = (c: Checkout) => ["Seen on Stellar", "Right wallet", `USDC, exactly ${money(c.amount)}`, "Reference matches", "Transaction succeeded"];

export default function CheckoutPage() {
  const { ref } = useParams<{ ref: string }>();
  const reference = decodeURIComponent(ref).toUpperCase();
  const demo = reference === "DEMO";
  const router = useRouter();
  const toast = useToast();
  const now = useNow();
  const opened = useRef(false);
  const [step, setStep] = useState<Step>({ kind: "pay" });
  const [tab, setTab] = useState<"wallet" | "manual">("wallet");
  const [wallets, setWallets] = useState<WalletOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [demoPaid, setDemoPaid] = useState(false);

  const { data: live, error: loadError, mutate } = useSWR<Checkout>(
    demo ? null : `/public/pay/${reference}`,
    (path: string) => {
      const first = !opened.current;
      opened.current = true;
      return fetcher<Checkout>(first ? `${path}?opened=1` : path);
    },
    { refreshInterval: 3000 },
  );
  // The preview is built from the clock, so it renders in the browser only (no SSR mismatch).
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const c = demo && mounted ? demoCheckout(demoPaid ? "PAID" : "PENDING") : demo ? undefined : live;

  const status = c?.status;
  const cref = c?.reference;
  useEffect(() => {
    if (status !== "PAID" || !cref) return;
    const t = setTimeout(() => router.replace(`/pay/${demo ? "demo" : cref}/receipt`), step.kind === "detect" ? 2300 : 0);
    return () => clearTimeout(t);
  }, [status, cref, demo, router, step.kind]);

  async function openWallets() {
    setError(null);
    setStep({ kind: "wallets" });
    if (!wallets && !demo) setWallets(await listWallets().catch(() => []));
    if (demo) setWallets([{ id: "demo", name: "Freighter", icon: "/wallets/freighter.png", available: true, url: "" }]);
  }

  /** Runs the matcher on the hash. True once MoyaPay has recorded the transaction. */
  async function verify(hash: string): Promise<boolean> {
    // Horizon can take a moment to index a just-submitted transaction.
    for (let i = 0; i < 12; i++) {
      try {
        await mutate(await api<Checkout>(`/public/pay/${reference}/verify`, { method: "POST", body: { txHash: hash } }), { revalidate: false });
        return true;
      } catch (err) {
        if (!(err instanceof ApiError) || (err.code !== "TX_NOT_FOUND" && err.code !== "HORIZON_UNAVAILABLE")) return false;
        await sleep(1500);
      }
    }
    return false;
  }

  async function pay(w: WalletOption, payerKnown?: PayerAccount) {
    if (!c) return;
    setError(null);
    setStep({ kind: "sign", wallet: w });
    if (demo) {
      await sleep(1400);
      setStep({ kind: "detect", hash: null });
      await sleep(2600);
      setDemoPaid(true);
      return;
    }
    try {
      const address = payerKnown?.address ?? (await connect(w.id));
      const payer = payerKnown ?? (await loadPayer(address));
      if (!payer.hasTrustline) return setStep({ kind: "trust", wallet: w, payer });
      if (percentOf(payer.usdc, c.amount) < 100) {
        setStep({ kind: "sign", wallet: w, note: `This wallet holds ${money(payer.usdc)} USDC, less than the ${money(c.amount)} due. Stellar will reject it.` });
      }
      const sent = await payRequest(w.id, address, { destination: c.destination, amount: c.amount, reference: c.reference });
      const onChain = sent.ok || sent.uncertain || sent.codes?.transaction === "tx_failed";
      if (!onChain) {
        // Rejected before the ledger (bad sequence, fee, …): nothing was sent, nothing to record.
        const codes = sent.codes?.operations?.join(", ") || sent.codes?.transaction;
        setError(`Stellar rejected the transaction${codes ? ` (${codes})` : ""}. Nothing was sent.`);
        setStep({ kind: "pay" });
        return;
      }
      setDismissed(null);
      setStep({
        kind: "detect",
        hash: sent.hash,
        note: sent.uncertain ? "Stellar is slow to answer. Don't pay again: we're checking whether this one landed." : undefined,
      });
      const recorded = await verify(sent.hash);
      if (sent.ok) return;
      if (recorded) {
        // Failed on-chain (e.g. op_underfunded): the request is now FAILED; show why.
        setStep({ kind: "pay" });
      } else if (sent.uncertain) {
        setStep({
          kind: "detect",
          hash: sent.hash,
          note: "We still can't find this transaction on Stellar. Check your wallet's history before paying again; if it isn't there, nothing was sent.",
        });
      }
    } catch (err) {
      setError(err instanceof WalletError || err instanceof PayError ? err.message : errorText(err));
      setStep({ kind: "pay" });
    }
  }

  async function addTrust(w: WalletOption, payer: PayerAccount) {
    setError(null);
    setStep({ kind: "sign", wallet: w, note: "Approve adding USDC to your wallet. It's a one-time step." });
    try {
      const res = await addUsdcTrustline(w.id, payer.address);
      if (!res.ok) throw new Error(`Stellar rejected it (${res.codes?.operations?.join(", ") ?? res.codes?.transaction ?? "unknown"})`);
      toast("USDC added to your wallet");
      await pay(w, { ...payer, hasTrustline: true });
    } catch (err) {
      setError(errorText(err));
      setStep({ kind: "pay" });
    }
  }

  if (loadError) {
    const missing = loadError instanceof ApiError && (loadError.status === 404 || loadError.status === 400);
    return (
      <Frame band={false}>
        <div style={{ paddingTop: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.04em" }}>{missing ? "We can't find this payment link" : "Couldn't load this payment"}</h1>
          <p style={{ margin: 0, fontSize: 15, color: "#5B5876", lineHeight: 1.55 }}>{missing ? "Check the link with the merchant who sent it." : errorText(loadError)}</p>
          {!missing && (
            <button type="button" className="btn" onClick={() => void mutate()}>
              Try again
            </button>
          )}
        </div>
      </Frame>
    );
  }
  if (!c) {
    return (
      <Frame>
        <div className="skel" style={{ height: 170, borderRadius: 20 }} />
        <div className="skel" style={{ height: 48, borderRadius: 13 }} />
      </Frame>
    );
  }

  const lastKey = c.lastPayment?.txHash ?? "";
  const busy = step.kind === "sign" || step.kind === "detect";
  const issue =
    c.status === "EXPIRED"
      ? "expired"
      : !busy && dismissed !== lastKey && c.status === "FAILED"
        ? "failed"
        : !busy && dismissed !== lastKey && c.status === "PENDING" && (c.lastPayment?.result === "WRONG_AMOUNT" || c.lastPayment?.result === "WRONG_ASSET")
          ? "wrong"
          : null;
  if (issue) return <Issue c={c} kind={issue} onBack={() => setDismissed(lastKey)} />;

  const payish = step.kind === "pay" || step.kind === "wallets";
  const detectDone = c.status === "PAID";

  return (
    <Frame
      pill={demo ? "Preview" : "Testnet"}
      footer={
        <>
          {payish && tab === "wallet" && (
            <button type="button" className="btn" onClick={() => void openWallets()}>
              Pay {money(c.amount)} USDC
            </button>
          )}
          {payish && tab === "manual" && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 56, borderRadius: 16, background: "#FFFFFF", border: "1px dashed #D3CFE6", fontSize: 14, fontWeight: 700, color: "#5B5876" }}>
              <span className="live" />
              Waiting for your payment
            </div>
          )}
          {step.kind === "sign" && (
            <button type="button" className="btn alt" onClick={() => setStep({ kind: "pay" })}>
              Cancel
            </button>
          )}
          {step.kind === "trust" && (
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="btn alt" style={{ flex: 1 }} onClick={() => setStep({ kind: "pay" })}>
                Cancel
              </button>
              <button type="button" className="btn" style={{ flex: 1.5 }} onClick={() => void addTrust(step.wallet, step.payer)}>
                Add USDC
              </button>
            </div>
          )}
          {step.kind === "detect" && detectDone && (
            <Link href={`/pay/${demo ? "demo" : c.reference}/receipt`} className="btn" style={{ color: "#FFFFFF" }}>
              See receipt
            </Link>
          )}
          {step.kind === "detect" && !detectDone && step.note?.startsWith("We still can't") && (
            <button type="button" className="btn alt" onClick={() => setStep({ kind: "pay" })}>
              It isn't in my wallet: try again
            </button>
          )}
          <TestnetNote />
        </>
      }
    >
      <Summary c={c} now={now} />

      {error && (
        <div className="alert bad shake" role="alert">
          <Icon name="warn" size={18} stroke={2.4} color="#B42318" style={{ flex: "0 0 auto" }} />
          <span>{error}</span>
        </div>
      )}

      {payish && (
        <>
          <div className="rise d1" role="tablist" aria-label="How to pay" style={{ display: "flex", gap: 4, padding: 4, borderRadius: 13, background: "#ECEAF5" }}>
            <button type="button" role="tab" className="seg" aria-selected={tab === "wallet"} onClick={() => setTab("wallet")} style={tab === "wallet" ? { color: "#12102A" } : undefined}>
              Wallet
            </button>
            <button type="button" role="tab" className="seg" aria-selected={tab === "manual"} onClick={() => setTab("manual")} style={tab === "manual" ? { color: "#12102A" } : undefined}>
              Send manually
            </button>
          </div>
          {tab === "wallet" ? (
            <section className="rise d2" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 11, fontSize: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#77748F" }}>Paying to</span>
                  <span className="mono" style={{ fontWeight: 600 }}>{shortAddr(c.destination)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#77748F" }}>Reference</span>
                  <span style={{ fontWeight: 600 }}>Added for you</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#77748F" }}>Network fee</span>
                  <span style={{ fontWeight: 600 }}>under 0.0001 XLM</span>
                </div>
              </div>
              <p style={{ margin: 0, display: "flex", gap: 8, fontSize: 13, lineHeight: 1.5, color: "#5B5876" }}>
                <Icon name="lock" size={16} stroke={2.2} color="#5B3DF5" style={{ flex: "0 0 auto", marginTop: 2 }} />
                You approve it in your own wallet. MoyaPay never sees your keys.
              </p>
            </section>
          ) : (
            <section className="rise" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                {(
                  [
                    ["Send to", c.destination, c.destination, true],
                    ["Amount", `${money(c.amount)} USDC exactly`, c.amount, false],
                    ["Memo (text)", c.memo, c.memo, true],
                  ] as const
                ).map(([label, shown, copy, mono]) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#77748F" }}>{label}</span>
                      <span className={mono ? "mono" : undefined} style={{ fontSize: label === "Send to" ? 12 : 15, fontWeight: label === "Amount" ? 800 : 600, wordBreak: "break-all" }}>
                        {shown}
                      </span>
                    </div>
                    <CopyButton text={copy} className="cp" ariaLabel={`Copy ${label.toLowerCase()}`} />
                  </div>
                ))}
              </div>
              <div className="alert wait">
                <Icon name="warn" size={18} stroke={2.4} color="#9A5B00" style={{ flex: "0 0 auto" }} />
                <span>Add the memo, or we can't match your payment. Send USDC from issuer {shortAddr(c.asset.issuer ?? "")}.</span>
              </div>
            </section>
          )}
        </>
      )}

      {step.kind === "sign" && (
        <section className="card pop" style={{ padding: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center" }}>
          <span style={{ position: "relative", display: "inline-flex" }}>
            <span aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#5B3DF5", animation: "ripple 1.6s ease-out infinite" }} />
            <span style={{ position: "relative", width: 60, height: 60, borderRadius: "50%", background: "#5B3DF5", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="wallet" size={26} stroke={2.2} />
            </span>
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>Approve in {step.wallet.name}</span>
            <span style={{ fontSize: 14, color: "#77748F" }}>
              {money(c.amount)} USDC to {c.merchant.name}, memo {c.reference}
            </span>
          </div>
          {step.note && (
            <div className="alert wait" style={{ textAlign: "left" }}>
              {step.note}
            </div>
          )}
        </section>
      )}

      {step.kind === "trust" && (
        <section className="card pop" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 800 }}>Your wallet can't hold USDC yet</span>
          <span style={{ fontSize: 14, lineHeight: 1.5, color: "#5B5876" }}>
            {shortAddr(step.payer.address)} has no USDC trustline. Add USDC once (a tiny XLM reserve, nothing else), then pay.
          </span>
        </section>
      )}

      {step.kind === "detect" && (
        <section className="card pop" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }} aria-live="polite">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {detectDone ? (
              <span className="popBig" style={{ width: 22, height: 22, borderRadius: "50%", background: "#12B76A", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="check" size={14} stroke={3} />
              </span>
            ) : (
              <span className="spin" />
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 17, fontWeight: 800 }}>{detectDone ? "Payment verified" : "Checking your payment"}</span>
              <span style={{ fontSize: 13, color: "#77748F" }}>{detectDone ? "Taking you to your receipt" : "Usually a few seconds"}</span>
            </div>
          </div>
          {step.note && !detectDone && (
            <div className="alert wait" role="status">
              {step.note}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 14, fontWeight: 600 }}>
            {CHECKS(c).map((label, i) => (
              <span key={label} className={detectDone ? `t${i + 1}` : undefined} style={{ display: "flex", alignItems: "center", gap: 10, opacity: detectDone ? undefined : 0.35 }}>
                <span style={{ width: 20, height: 20, borderRadius: "50%", background: detectDone ? "#12B76A" : "#DDD5FF", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>✓</span>
                {label}
                {i === 0 && c.lastPayment && detectDone ? ` · ${when(c.lastPayment.ledgerClosedAt)}` : ""}
              </span>
            ))}
          </div>
        </section>
      )}

      {step.kind === "wallets" && (
        <>
          <button type="button" aria-label="Close" onClick={() => setStep({ kind: "pay" })} style={{ position: "fixed", inset: 0, zIndex: 5, border: 0, padding: 0, background: "rgba(18, 16, 42, 0.45)", animation: "fade .25s ease both" }} />
          <div role="dialog" aria-label="Choose a wallet" style={{ position: "fixed", zIndex: 6, left: "50%", bottom: 0, width: "100%", maxWidth: 440, transform: "translateX(-50%)" }}>
            <div style={{ padding: "10px 18px 26px", borderRadius: "26px 26px 0 0", background: "#FFFFFF", display: "flex", flexDirection: "column", gap: 10, animation: "up .4s cubic-bezier(.2,.8,.2,1) both" }}>
              <span style={{ width: 40, height: 5, borderRadius: 9, background: "#E4E2EE", alignSelf: "center", marginBottom: 6 }} />
              <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>Pay with</span>
              {!wallets && [0, 1, 2].map((i) => <div key={i} className="skel" style={{ height: 60, borderRadius: 16 }} />)}
              {wallets?.map((w) => (
                <button key={w.id} type="button" className="wl" disabled={!w.available} onClick={() => void pay(w)}>
                  <WalletLogo wallet={w} />
                  <span style={{ flexGrow: 1 }}>{w.name}</span>
                  {w.available ? <Icon name="chevron" size={16} stroke={2.4} color="#77748F" /> : <span style={{ fontSize: 12, fontWeight: 700, color: "#77748F" }}>Not installed</span>}
                </button>
              ))}
              {wallets && wallets.every((w) => !w.available) && (
                <span className="hint">No Stellar wallet found in this browser. Install Freighter, or use “Send manually”.</span>
              )}
            </div>
          </div>
        </>
      )}
    </Frame>
  );
}
