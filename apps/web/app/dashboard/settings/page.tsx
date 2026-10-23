"use client";

import { useState } from "react";
import { Page, PageHeader } from "@/components/AppShell";
import { CopyButton } from "@/components/CopyButton";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { api, errorText } from "@/lib/api";
import { explorerAccount } from "@/lib/config";
import { when } from "@/lib/format";
import { useSession } from "@/lib/session";

export default function Settings() {
  const toast = useToast();
  const { merchant, refresh } = useSession();
  const [name, setName] = useState(merchant.name);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await refresh(await api("/auth/me", { method: "PATCH", body: { name: name.trim() } }), { revalidate: false });
      toast("Saved");
    } catch (e) {
      toast(errorText(e), "bad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <PageHeader title="Settings" sub="Your business and the wallet you get paid to." />
      <section className="card rise d1" style={{ maxWidth: 720, padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Business</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          <label htmlFor="name" className="lbl">
            Name <span style={{ fontWeight: 500, color: "#77748F" }}>(payers see it on the checkout)</span>
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <input id="name" className="in" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} style={{ flex: "1 1 260px" }} />
            <button type="submit" className="btn" disabled={busy || !name.trim() || name.trim() === merchant.name}>
              Save
            </button>
          </div>
        </form>
      </section>
      <section className="card rise d2" style={{ maxWidth: 720, padding: 22, display: "flex", flexDirection: "column", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Wallet</h2>
        <span className="k">Signed in with, and paid to by default</span>
        <div style={{ padding: "12px 14px", borderRadius: 12, background: "#F6F5FB", display: "flex", alignItems: "center", gap: 10 }}>
          <span className="mono" style={{ flexGrow: 1, minWidth: 0, fontSize: 13, wordBreak: "break-all" }}>
            {merchant.walletAddress}
          </span>
          <CopyButton text={merchant.walletAddress} iconOnly ariaLabel="Copy address" className="btn alt" style={{ minHeight: 38, padding: "0 12px" }} />
        </div>
        <span className="hint">
          Merchant since {when(merchant.createdAt)} ·{" "}
          <a href={explorerAccount(merchant.walletAddress)} target="_blank" rel="noopener">
            View on Stellar Expert
          </a>
        </span>
      </section>
      <section className="card rise d3" style={{ maxWidth: 720, padding: 22, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <span style={{ flexGrow: 1, fontSize: 14, color: "#5B5876" }}>Sign out of MoyaPay on this browser.</span>
        <button
          type="button"
          className="btn danger"
          onClick={async () => {
            await api("/auth/logout", { method: "POST" }).catch(() => undefined);
            // A full page load drops every cached response from this session.
            window.location.assign("/signin");
          }}
        >
          <Icon name="logout" size={16} />
          Sign out
        </button>
      </section>
    </Page>
  );
}
