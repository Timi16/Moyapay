"use client";

import type { Checkout } from "@moyapay/shared";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import useSWR from "swr";
import { CopyButton } from "@/components/CopyButton";
import { Icon } from "@/components/Icon";
import { errorText, fetcher } from "@/lib/api";
import { explorerTx } from "@/lib/config";
import { money, whenFull } from "@/lib/format";
import { demoCheckout } from "../../_components/demo";
import { Frame } from "../../_components/Frame";

const noop = () => () => undefined;
const CONFETTI: [string, string, string][] = [
  ["8%", "#5B3DF5", "0s"],
  ["18%", "#A996FF", ".3s"],
  ["30%", "#12B76A", ".1s"],
  ["44%", "#5B3DF5", ".5s"],
  ["57%", "#F5B000", ".2s"],
  ["69%", "#4527D9", ".6s"],
  ["80%", "#12B76A", ".35s"],
  ["91%", "#A996FF", ".15s"],
];

export default function Receipt() {
  const { ref } = useParams<{ ref: string }>();
  const reference = decodeURIComponent(ref).toUpperCase();
  const demo = reference === "DEMO";
  const router = useRouter();
  const { data: live, error } = useSWR<Checkout>(demo ? null : `/public/pay/${reference}`, fetcher);
  // The preview is built from the clock, so it renders in the browser only (no SSR mismatch).
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const c = demo && mounted ? demoCheckout("PAID") : demo ? undefined : live;
  const status = c?.status;

  useEffect(() => {
    if (status && status !== "PAID") router.replace(`/pay/${reference}`);
  }, [status, reference, router]);

  if (error) {
    return (
      <Frame band={false}>
        <div style={{ paddingTop: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.04em" }}>We can't load this receipt</h1>
          <p style={{ margin: 0, fontSize: 15, color: "#5B5876", lineHeight: 1.55 }}>{errorText(error)}</p>
        </div>
      </Frame>
    );
  }
  if (!c || c.status !== "PAID") {
    return (
      <Frame band={false}>
        <div className="skel" style={{ height: 320, borderRadius: 20, marginTop: 40 }} />
      </Frame>
    );
  }
  const hash = c.paidTxHash;

  return (
    <Frame
      band={false}
      footer={
        <div className="rise d4 no-print" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button type="button" className="btn" onClick={() => window.print()}>
            Save receipt
          </button>
          {hash && <CopyButton text={hash} label="Copy transaction hash" className="btn alt" />}
        </div>
      }
    >
      <div aria-hidden="true" className="no-print" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2, overflow: "hidden" }}>
        {CONFETTI.map(([left, bg, delay]) => (
          <i key={left} className="cf" style={{ left, background: bg, animationDelay: delay }} />
        ))}
      </div>
      <div style={{ paddingTop: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
        <span style={{ position: "relative", display: "inline-flex" }}>
          <span aria-hidden="true" className="no-print" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#12B76A", animation: "ripple 1.8s ease-out infinite" }} />
          <span className="popBig" style={{ position: "relative", width: 88, height: 88, borderRadius: "50%", background: "#12B76A", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 16px 30px -12px rgba(18, 183, 106, 0.7)" }}>
            <Icon name="check" size={44} stroke={3} color="#FFFFFF" style={{ strokeDasharray: 30, strokeDashoffset: 30, animation: "drawCheck .5s .35s ease-out forwards" }} />
          </span>
        </span>
        <div className="rise d2" style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 6 }}>
          <h1 style={{ margin: 0, fontSize: 36, letterSpacing: "-0.05em", fontWeight: 800 }}>Paid</h1>
          <span style={{ fontSize: 15, color: "#5B5876" }}>
            {c.merchant.name} got your {money(c.amount)} USDC.
          </span>
        </div>
        <section className="rise d3 rcpt" aria-label="Receipt" style={{ position: "relative", width: "100%", padding: "20px 18px", borderRadius: 20, background: "#FFFFFF", border: "1px solid #ECEAF5", boxShadow: "0 20px 40px -28px rgba(69, 39, 217, 0.4)", display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="kv">
            <span>Amount</span>
            <span>{money(c.amount)} USDC</span>
          </div>
          {c.description && (
            <div className="kv">
              <span>For</span>
              <span>{c.description}</span>
            </div>
          )}
          <div className="kv">
            <span>Reference</span>
            <span className="mono" style={{ fontWeight: 600 }}>{c.reference}</span>
          </div>
          {c.paidAt && (
            <div className="kv">
              <span>Paid</span>
              <span>{whenFull(c.paidAt)}</span>
            </div>
          )}
          <div className="kv">
            <span>Network</span>
            <span>Stellar Testnet</span>
          </div>
          <div style={{ height: 0, borderTop: "2px dashed #ECEAF5", margin: "4px -18px" }} />
          {hash ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#77748F" }}>Transaction hash</span>
                <span className="mono" style={{ fontSize: 12, lineHeight: 1.6, wordBreak: "break-all" }}>{hash}</span>
              </div>
              <a href={explorerTx(hash)} target="_blank" rel="noopener" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 700 }}>
                Check it on Stellar Expert
                <Icon name="external" size={14} stroke={2.6} />
              </a>
            </>
          ) : (
            <span style={{ fontSize: 13, color: "#77748F" }}>Preview receipt: no transaction was sent.</span>
          )}
        </section>
      </div>
    </Frame>
  );
}
