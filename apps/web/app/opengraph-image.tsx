import { ImageResponse } from "next/og";

export const alt = "MoyaPay: payments that check themselves";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          color: "#FFFFFF",
          background: "radial-gradient(120% 140% at 100% 0%, #8B6CFF 0%, #5B3DF5 48%, #3A1FC4 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div style={{ width: 96, height: 96, borderRadius: 28, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#5B3DF5" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 18C4.5 10 6 6 8 6c2 0 2.5 7 4 7s2-7 4-7 3.5 4 4 12" />
            </svg>
          </div>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 800, letterSpacing: -3 }}>
            moya<span style={{ color: "#CFC3FF" }}>pay</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -4, lineHeight: 1 }}>Payments that check themselves.</div>
          <div style={{ fontSize: 30, color: "#E4DDFF" }}>USDC pay links on Stellar, verified on-chain and matched in seconds.</div>
        </div>
      </div>
    ),
    size,
  );
}
