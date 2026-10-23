"use client";

import { WEBHOOK_EVENTS, type ApiKey, type WebhookDelivery, type WebhookEvent, type WebhookSettings } from "@moyapay/shared";
import { useState } from "react";
import useSWR, { type KeyedMutator } from "swr";
import { Page, PageHeader } from "@/components/AppShell";
import { CopyButton } from "@/components/CopyButton";
import { useToast } from "@/components/Toast";
import { api, errorText, fetcher } from "@/lib/api";
import { REPO_URL } from "@/lib/config";
import { ago, when } from "@/lib/format";

const ENDPOINTS: [string, string, string][] = [
  ["POST", "/api/v1/payment-requests", "Create a request, get its reference and pay link"],
  ["GET", "/api/v1/payment-requests", "List requests, filter by status"],
  ["GET", "/api/v1/payment-requests/:ref", "Status, amount and transaction hash"],
  ["POST", "/api/v1/payment-requests/:ref/verify", "Check a transaction hash right now"],
  ["GET", "/api/v1/transactions", "Reconciliation records with match results"],
  ["PATCH", "/api/v1/transactions/:id", "Assign, refund or ignore a flagged payment"],
];
const EVENT_LOOK: Record<WebhookEvent, [string, string]> = {
  "request.paid": ["#E7F8EF", "#067647"],
  "request.failed": ["#FEECEB", "#B42318"],
  "request.expired": ["#F0EFF5", "#5B5876"],
  "payment.unmatched": ["#E6F0FF", "#1D4ED8"],
};

function ApiKeyCard() {
  const toast = useToast();
  const { data, mutate } = useSWR<{ data: ApiKey[] }>("/api-keys", fetcher);
  const key = data?.data.find((k) => !k.revokedAt) ?? null;
  // The full key exists only in this tab, right after it was created or rolled.
  const [secret, setSecret] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function issue() {
    setBusy(true);
    try {
      const res = await api<{ key: string }>(key ? `/api-keys/${key.id}/roll` : "/api-keys", { method: "POST", body: key ? undefined : { name: "Default" } });
      setSecret(res.key);
      setRevealed(true);
      await mutate();
      toast(key ? "Key rolled. The old one stopped working." : "API key created. Copy it now.");
    } catch (e) {
      toast(errorText(e), "bad");
    } finally {
      setBusy(false);
    }
  }

  const masked = key ? `${key.prefix}${"•".repeat(24)}` : "No key yet";
  return (
    <section className="card rise d1" aria-labelledby="keys" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h2 id="keys" style={{ margin: 0, flexGrow: 1, fontSize: 17, fontWeight: 800 }}>
          API key
        </h2>
        <span style={{ display: "inline-flex", alignItems: "center", height: 26, padding: "0 10px", borderRadius: 999, background: "#FFF4E0", color: "#9A5B00", fontSize: 12, fontWeight: 700 }}>Testnet</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <div style={{ flex: "1 1 360px", minWidth: 0, height: 46, padding: "0 14px", borderRadius: 12, background: "#F6F5FB", border: "1px solid #ECEAF5", display: "flex", alignItems: "center" }}>
          <span className="mono" style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {secret && revealed ? secret : masked}
          </span>
        </div>
        {secret ? (
          <>
            <button type="button" className="btn alt" onClick={() => setRevealed((r) => !r)}>
              {revealed ? "Hide" : "Reveal"}
            </button>
            <CopyButton text={secret} />
          </>
        ) : (
          <button type="button" className="btn alt" disabled title="A key is shown once, when it is created. Roll it to get a new one.">
            Reveal
          </button>
        )}
        <button type="button" className={key ? "btn alt" : "btn"} disabled={busy || !data} onClick={() => void issue()}>
          {busy && <span className="spin sm" />}
          {key ? "Roll key" : "Create key"}
        </button>
      </div>
      <span style={{ fontSize: 13, color: "#77748F" }}>
        {secret ? "Copy it now: it won't be shown again. " : key ? `Created ${when(key.createdAt)}${key.lastUsedAt ? `, last used ${ago(key.lastUsedAt)} ago` : ", not used yet"}. ` : ""}
        Send it as <span className="mono">Authorization: Bearer &lt;key&gt;</span>. Keep it on your server, never in a browser.
      </span>
    </section>
  );
}

function WebhookCard() {
  const { data, mutate } = useSWR<WebhookSettings>("/webhook", fetcher);
  if (!data) return <div className="card skel" style={{ flex: "1 1 320px", minHeight: 300 }} />;
  return <WebhookForm data={data} mutate={mutate} />;
}

function WebhookForm({ data, mutate }: { data: WebhookSettings; mutate: KeyedMutator<WebhookSettings> }) {
  const toast = useToast();
  const { data: deliveries, mutate: reload } = useSWR<{ data: WebhookDelivery[] }>("/webhook/deliveries", fetcher, { refreshInterval: 5000 });
  const [url, setUrl] = useState(data.url ?? "");
  const [events, setEvents] = useState<WebhookEvent[]>(data.url ? data.events : [...WEBHOOK_EVENTS]);
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      toast(done);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card rise d3" aria-labelledby="hook" style={{ flex: "1 1 320px", minWidth: 0, padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 id="hook" style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
        Status updates
      </h2>
      <label htmlFor="wh" style={{ fontSize: 14, fontWeight: 700 }}>
        Notify this URL when a request changes
      </label>
      <input id="wh" type="url" className="in" placeholder="https://your-app.example/hooks/moyapay" value={url} onChange={(e) => setUrl(e.target.value)} style={{ height: 46, fontSize: 14 }} />
      <div role="group" aria-label="Events" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {WEBHOOK_EVENTS.map((e) => {
          const on = events.includes(e);
          const [bg, fg] = EVENT_LOOK[e];
          return (
            <button
              key={e}
              type="button"
              aria-pressed={on}
              className="mono"
              onClick={() => setEvents((xs) => (on ? xs.filter((x) => x !== e) : [...xs, e]))}
              style={{ padding: "4px 10px", borderRadius: 8, border: 0, fontSize: 12, background: on ? bg : "#FFFFFF", color: on ? fg : "#77748F", boxShadow: on ? "none" : "inset 0 0 0 1px #E4E2EE", textDecoration: on ? "none" : "line-through" }}
            >
              {e}
            </button>
          );
        })}
      </div>
      {err && (
        <div className="alert bad" role="alert">
          {err}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await mutate(await api<WebhookSettings>("/webhook", { method: "PUT", body: { url: url.trim() || null, events } }), { revalidate: false });
            }, url.trim() ? "Webhook saved" : "Webhooks turned off")
          }
        >
          Save
        </button>
        <button
          type="button"
          className="btn alt"
          disabled={busy || !data.url}
          onClick={() =>
            void run(async () => {
              await api("/webhook/test", { method: "POST" });
              await reload();
            }, "Test webhook queued")
          }
        >
          Send test
        </button>
      </div>
      {(
        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 6, borderTop: "1px solid #F1F0F7" }}>
          <span className="k">Signing secret (HMAC-SHA256, header MoyaPay-Signature)</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span className="mono" style={{ flex: "1 1 200px", minWidth: 0, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {showSecret ? data.secret : `whsec_${"•".repeat(20)}`}
            </span>
            <button type="button" className="pick" onClick={() => setShowSecret((s) => !s)}>
              {showSecret ? "Hide" : "Reveal"}
            </button>
            <CopyButton text={data.secret} className="pick" />
            <button
              type="button"
              className="pick"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await mutate(await api<WebhookSettings>("/webhook/roll-secret", { method: "POST" }), { revalidate: false });
                }, "Secret rolled")
              }
            >
              Roll
            </button>
          </div>
        </div>
      )}
      {deliveries && deliveries.data.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="k">Recent deliveries</span>
          {deliveries.data.slice(0, 5).map((d) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "6px 0", borderBottom: "1px solid #F1F0F7" }}>
              <span className={`chip ${d.status === "DELIVERED" ? "ok" : d.status === "FAILED" ? "bad" : "wait"}`}>{d.status === "DELIVERED" ? `${d.lastStatusCode ?? 200}` : d.status === "FAILED" ? "Failed" : d.attempts > 0 ? "Retrying" : "Queued"}</span>
              <span className="mono" style={{ flexGrow: 1 }}>
                {d.event}
              </span>
              <span style={{ color: "#77748F" }}>{ago(d.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Developers() {
  return (
    <Page>
      <PageHeader title="Developers" sub="Create requests and read their status from your own app.">
        <a href={REPO_URL ? `${REPO_URL}/blob/main/docs/API.md` : "#endpoints"} className="btn alt" target={REPO_URL ? "_blank" : undefined} rel="noopener">
          Full API docs
        </a>
      </PageHeader>
      <ApiKeyCard />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        <section id="endpoints" className="card rise d2" aria-labelledby="eps" style={{ flex: "999 1 520px", minWidth: 0, padding: "8px 22px 12px" }}>
          <h2 id="eps" style={{ margin: "14px 0 4px", fontSize: 17, fontWeight: 800 }}>
            Endpoints
          </h2>
          {ENDPOINTS.map(([m, path, what], i) => (
            <div key={`${m} ${path}`} className="ep" style={i === ENDPOINTS.length - 1 ? { borderBottom: 0 } : undefined}>
              <span className={`m ${m.toLowerCase()}`}>{m}</span>
              <span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>
                {path}
              </span>
              <span style={{ flex: "1 1 200px", fontSize: 14, color: "#5B5876" }}>{what}</span>
            </div>
          ))}
        </section>
        <WebhookCard />
      </div>
    </Page>
  );
}
