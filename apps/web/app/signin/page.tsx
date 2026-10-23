"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
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

type Step = { kind: "pick" } | { kind: "signing"; wallet: string } | { kind: "name"; address: string };

/** Only same-site paths are followed after sign-in. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

function SignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [wallets, setWallets] = useState<WalletOption[] | null>(null);
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listWallets()
      .then(setWallets)
      .catch(() => setWallets([]));
  }, []);

  async function signIn(w: WalletOption) {
    setError(null);
    setStep({ kind: "signing", wallet: w.name });
    try {
      const address = await connect(w.id);
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
      setStep({ kind: "pick" });
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

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 16px", background: "#F6F5FB" }}>
      <Link href="/" aria-label="MoyaPay home" className="rise" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 36 }}>
        <LogoTile size={36} />
        <Wordmark size={23} />
      </Link>
      <section className="card rise d1" style={{ width: "100%", maxWidth: 440, padding: 28, display: "flex", flexDirection: "column", gap: 18, borderRadius: 24 }}>
        {step.kind === "name" ? (
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
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <h1 style={{ margin: 0, fontSize: 26, letterSpacing: "-0.04em", fontWeight: 800 }}>Sign in with your wallet</h1>
              <span style={{ fontSize: 14, lineHeight: 1.55, color: "#5B5876" }}>
                No password. Your wallet signs a one-time message to prove the account is yours. Payments you request go to this wallet.
              </span>
            </div>
            {error && (
              <div className="alert bad shake" role="alert">
                <Icon name="warn" size={18} stroke={2.4} color="#B42318" style={{ flex: "0 0 auto" }} />
                <span>{error}</span>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {wallets === null
                ? [0, 1, 2].map((i) => <div key={i} className="skel" style={{ height: 60, borderRadius: 16 }} />)
                : wallets.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      className="wl"
                      disabled={step.kind === "signing" || !w.available}
                      onClick={() => void signIn(w)}
                    >
                      <WalletLogo wallet={w} />
                      <span style={{ flexGrow: 1 }}>{w.name}</span>
                      {step.kind === "signing" && step.wallet === w.name ? (
                        <span className="spin sm" aria-label="Waiting for the wallet" />
                      ) : w.available ? (
                        <Icon name="chevron" size={16} stroke={2.4} color="#77748F" />
                      ) : (
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#77748F" }}>Not installed</span>
                      )}
                    </button>
                  ))}
            </div>
            {step.kind === "signing" && (
              <span className="hint" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="live" />
                Approve the sign-in in {step.wallet}.
              </span>
            )}
            <p style={{ margin: 0, display: "flex", gap: 8, fontSize: 13, lineHeight: 1.5, color: "#5B5876" }}>
              <Icon name="lock" size={16} stroke={2.2} color="#5B3DF5" style={{ flex: "0 0 auto", marginTop: 2 }} />
              MoyaPay never sees your keys. Set your wallet to Testnet; no real money moves.
            </p>
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
