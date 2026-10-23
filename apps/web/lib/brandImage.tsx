import { ImageResponse } from "next/og";

/** The app icon: the white wave M on the violet gradient tile (radius ≈ 30%). */
export function iconResponse(size: number, padded = false) {
  const tile = padded ? Math.round(size * 0.82) : size;
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: padded ? "#5B3DF5" : "transparent" }}>
        <div
          style={{
            width: tile,
            height: tile,
            borderRadius: Math.round(tile * 0.3),
            background: "linear-gradient(135deg, #7C5CFF, #4527D9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width={Math.round(tile * 0.62)} height={Math.round(tile * 0.62)} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 18C4.5 10 6 6 8 6c2 0 2.5 7 4 7s2-7 4-7 3.5 4 4 12" />
          </svg>
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
