import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";

/** The payer's phone-first column (390 px on the canvas), centred on larger screens. */
export function Frame({ children, footer, band = true, pill = "Testnet" }: { children: ReactNode; footer?: ReactNode; band?: boolean; pill?: string }) {
  return (
    <div className="co" style={{ minHeight: "100vh", background: "#F6F5FB", display: "flex", justifyContent: "center" }}>
      <div style={{ position: "relative", width: "100%", maxWidth: 440, minHeight: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", color: "#12102A" }}>
        {band && (
          <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: 0, height: 250, background: "var(--grad)", overflow: "hidden" }}>
            <svg width="520" height="250" viewBox="0 0 520 250" fill="none" style={{ position: "absolute", left: -40, top: 20, opacity: 0.25 }}>
              <path d="M0 220C40 80 90 40 140 40c70 0 80 150 130 150s60-150 130-150 90 80 120 180" stroke="#FFFFFF" strokeWidth={2} strokeDasharray="6 10" style={{ animation: "flow 6s linear infinite" }} />
            </svg>
          </div>
        )}
        <header style={{ position: "relative", height: 64, padding: "0 18px", display: "flex", alignItems: "center", justifyContent: "space-between", color: band ? "#FFFFFF" : "#5B5876", flex: "0 0 auto" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
            <Icon name="wave" size={18} stroke={2.8} color={band ? "#FFFFFF" : "#5B3DF5"} />
            Secured by moyapay
          </span>
          {band && (
            <span style={{ display: "inline-flex", alignItems: "center", height: 26, padding: "0 10px", borderRadius: 999, background: "rgba(255, 255, 255, 0.18)", fontSize: 12, fontWeight: 700 }}>{pill}</span>
          )}
        </header>
        <main style={{ position: "relative", flex: "1 0 auto", padding: "4px 18px 16px", display: "flex", flexDirection: "column", gap: 14 }}>{children}</main>
        {footer && (
          <div style={{ position: "sticky", bottom: 0, zIndex: 3, padding: "14px 18px 26px", display: "flex", flexDirection: "column", gap: 10, background: "linear-gradient(180deg, rgba(246, 245, 251, 0), #F6F5FB 30%)" }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function TestnetNote() {
  return <span style={{ textAlign: "center", fontSize: 12, color: "#77748F" }}>Stellar Testnet · no real money moves</span>;
}
