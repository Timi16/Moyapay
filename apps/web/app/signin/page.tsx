"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { Icon } from "@/components/Icon";
import { LogoTile, Wordmark } from "@/components/Logo";
import { WalletLogo } from "@/components/WalletLogo";
import { api, errorText } from "@/lib/api";
import { shortAddr } from "@/lib/format";
import { connect, listWallets, signMessage, signTransaction, WalletError, type WalletOption } from "@/lib/wallet";

interface Challenge {
  challengeId: string;
  message: string;
  transaction: string;
}

type Step =
  | { kind: "pick"; connecting?: string }
  | { kind: "confirm"; wallet: WalletOption; address: string; signing?: boolean }
  | { kind: "name"; address: string };

/** Only same-site paths are followed after sign-in. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

const STEPS = ["Connect wallet", "Confirm", "Your business"];

function Steps({ at }: { at: number }) {
  return (
    <ol aria-label="Sign-in steps" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", gap: 8, flexWrap: "wrap" }}>
      {STEPS.map((label, i) => {
        const done = i < at;
        const on = i === at;
        return (
          <li
            key={label}
            aria-current={on ? "step" : undefined}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: on ? "#4527D9" : done ? "#067647" : "#77748F" }}
          >
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                background: on ? "#EDE9FF" : done ? "#E7F8EF" : "#F0EFF5",
              }}
            >
              {done ? "✓" : i + 1}
            </span>
            {label}
            {i < STEPS.length - 1 && <span aria-hidden="true" style={{ width: 14, height: 2, borderRadius: 2, background: "#ECEAF5", marginLeft: 2 }} />}
          </li>
        );
      })}
    </ol>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div className="alert bad shake" role="alert">
      <Icon name="warn" size={18} stroke={2.4} color="#B42318" style={{ flex: "0 0 auto" }} />
      <span>{text}</span>
    </div>
  );
}

function SignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [wallets, setWallets] = useState<WalletOption[] | null>(null);
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [error, setError] = useState<string | null>(null);
  const [apiDown, setApiDown] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listWallets()
      .then(setWallets)
      .catch(() => setWallets([]));
    // Sign-in needs the MoyaPay server; say so up front if it can't be reached.
    fetch("/api/v1/public/status", { cache: "no-store" })
      .then((r) => setApiDown(!r.ok))
      .catch(() => setApiDown(true));
  }, []);

  /** Step 1: connect the wallet and read its address. Nothing is signed yet. */
  async function pick(w: WalletOption) {
    setError(null);
    setStep({ kind: "pick", connecting: w.id });
    try {
      const address = await connect(w.id);
      setStep({ kind: "confirm", wallet: w, address });
    } catch (err) {
      setError(errorText(err));
      setStep({ kind: "pick" });
    }
  }

  /** Step 2: sign the one-time message (or challenge transaction) and start the session. */
  async function confirm(w: WalletOption, address: string) {
    setError(null);
    setStep({ kind: "confirm", wallet: w, address, signing: true });
    try {
      const ch = await api<Challenge>("/auth/challenge", { method: "POST", body: { address } });
      let proof: { signature: string } | { signedTransaction: string };
      try {
        proof = { signature: await signMessage(w.id, address, ch.message) };
      } catch (err) {
        // Wallets that can't sign a message sign the equivalent challenge transaction instead.
        if (err instanceof WalletError && err.code === "REJECTED") throw err;
        proof = { signedTransaction: await signTransaction(w.id, address, ch.transaction) };
      }
      const res = await api<{ created: boolean }>("/auth/verify", { method: "POST", body: { challengeId: ch.challengeId, ...proof } });
      if (res.created) setStep({ kind: "name", address });
      else router.replace(next);
    } catch (err) {
      setError(errorText(err));
      setStep({ kind: "confirm", wallet: w, address });
    }
  }

  async function saveName() {
    if (!name.trim()) return router.replace(next);
    setSaving(true);
    try {
      await api("/auth/me", { method: "PATCH", body: { name: name.trim() } });
      router.replace(next);
    } catch (err) {
      setError(errorText(err));
      setSaving(false);
    }
  }

  const at = step.kind === "pick" ? 0 : step.kind === "confirm" ? 1 : 2;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 16px", background: "#F6F5FB" }}>
      <Link href="/" aria-label="MoyaPay home" className="rise" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
        <LogoTile size={36} />
        <Wordmark size={23} />
      </Link>
      <section key={step.kind} className="card rise" style={{ width: "100%", maxWidth: 460, padding: 28, display: "flex", flexDirection: "column", gap: 18, borderRadius: 24 }}>
        <Steps at={at} />

        {apiDown && step.kind !== "name" && (
          <div className="alert wait" role="status">
            <Icon name="warn" size={18} stroke={2.4} color="#9A5B00" style={{ flex: "0 0 auto" }} />
            <span>MoyaPay's server can't be reached right now, so signing in won't finish. You can still connect your wallet; try again shortly.</span>
          </div>
        )}

        {step.kind === "pick" && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <h1 style={{ margin: 0, fontSize: 26, letterSpacing: "-0.04em", fontWeight: 800 }}>Connect your wallet</h1>
              <span style={{ fontSize: 14, lineHeight: 1.55, color: "#5B5876" }}>
                No password and no account to create. Pick the Stellar wallet you want to get paid to. You'll confirm on the next step before anything is signed.
              </span>
            </div>
            {error && <ErrorBox text={error} />}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {wallets === null
                ? [0, 1, 2].map((i) => <div key={i} className="skel" style={{ height: 60, borderRadius: 16 }} />)
                : wallets.map((w) => (
                    <button key={w.id} type="button" className="wl" disabled={Boolean(step.connecting) || !w.available} onClick={() => void pick(w)}>
                      <WalletLogo wallet={w} />
                      <span style={{ flexGrow: 1 }}>{w.name}</span>
                      {step.connecting === w.id ? (
                        <span className="spin sm" aria-label="Waiting for the wallet" />
                      ) : w.available ? (
                        <Icon name="chevron" size={16} stroke={2.4} color="#77748F" />
                      ) : (
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#77748F" }}>Not installed</span>
                      )}
                    </button>
                  ))}
            </div>
            {wallets && wallets.every((w) => !w.available) && (
              <span className="hint">
                No Stellar wallet found in this browser. Install{" "}
                <a href="https://www.freighter.app" target="_blank" rel="noopener">
                  Freighter
                </a>
                , set it to Testnet, then reload this page.
              </span>
            )}
            <p style={{ margin: 0, display: "flex", gap: 8, fontSize: 13, lineHeight: 1.5, color: "#5B5876" }}>
              <Icon name="lock" size={16} stroke={2.2} color="#5B3DF5" style={{ flex: "0 0 auto", marginTop: 2 }} />
              MoyaPay never sees your keys. Stellar Testnet only; no real money moves.
            </p>
          </>
        )}

        {step.kind === "confirm" && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <h1 style={{ margin: 0, fontSize: 26, letterSpacing: "-0.04em", fontWeight: 800 }}>Confirm it's you</h1>
              <span style={{ fontSize: 14, lineHeight: 1.55, color: "#5B5876" }}>Here's exactly what happens when you continue.</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, background: "#F6F5FB", border: "1px solid #ECEAF5" }}>
              <WalletLogo wallet={step.wallet} size={40} />
              <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 800 }}>{step.wallet.name}</span>
                <span className="mono" style={{ fontSize: 12, color: "#5B5876", wordBreak: "break-all" }}>
                  {step.address}
                </span>
              </div>
              <CopyButton text={step.address} iconOnly ariaLabel="Copy address" className="cp" />
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                ["wallet", `You sign in to MoyaPay as ${shortAddr(step.address)}.`],
                ["hash", "Your wallet asks you to sign a one-time message. It's not a payment: nothing is sent and there's no fee."],
                ["receipt", "Payment requests you create are paid to this address. You can use another address per request later."],
                ["lock", "Your keys stay in your wallet. MoyaPay only checks the signature."],
              ].map(([icon, text]) => (
                <li key={text} style={{ display: "flex", gap: 10, fontSize: 14, lineHeight: 1.5, color: "#3B3856" }}>
                  <span style={{ flex: "0 0 auto", width: 28, height: 28, borderRadius: 9, background: "#EDE9FF", color: "#4527D9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name={icon as "wallet"} size={15} stroke={2.2} />
                  </span>
                  <span style={{ paddingTop: 3 }}>{text}</span>
                </li>
              ))}
            </ul>
            {error && <ErrorBox text={error} />}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button type="button" className="btn" style={{ minHeight: 50 }} disabled={step.signing} onClick={() => void confirm(step.wallet, step.address)}>
                {step.signing ? (
                  <>
                    <span className="spin sm" />
                    Approve in {step.wallet.name}…
                  </>
                ) : (
                  "Confirm and sign"
                )}
              </button>
              <button
                type="button"
                className="btn alt"
                disabled={step.signing}
                onClick={() => {
                  setError(null);
                  setStep({ kind: "pick" });
                }}
              >
                Use a different wallet
              </button>
            </div>
          </>
        )}

        {step.kind === "name" && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="chip ok" style={{ alignSelf: "flex-start" }}>
                Wallet verified
              </span>
              <h1 style={{ margin: 0, fontSize: 26, letterSpacing: "-0.04em", fontWeight: 800 }}>What's your business called?</h1>
              <span style={{ fontSize: 14, lineHeight: 1.5, color: "#5B5876" }}>
                Payers see it on your checkout. Payments go to <span className="mono">{shortAddr(step.address)}</span>.
              </span>
            </div>
            {error && <ErrorBox text={error} />}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void saveName();
              }}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <label htmlFor="biz" className="lbl">
                Business name
              </label>
              <input id="biz" className="in" maxLength={80} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bisi's Bakery" />
              <button type="submit" className="btn" disabled={saving} style={{ minHeight: 50 }}>
                {saving ? <span className="spin sm" /> : null}Go to my dashboard
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}
