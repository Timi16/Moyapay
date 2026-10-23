import Link from "next/link";
import { Icon } from "./Icon";

/** The "wave M" on its gradient tile. */
export function LogoTile({ size = 32 }: { size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.31),
        background: "linear-gradient(135deg, #7C5CFF, #4527D9)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "0 0 auto",
      }}
    >
      <Icon name="wave" size={Math.round(size * 0.62)} stroke={2.8} color="#FFFFFF" />
    </span>
  );
}

export function Wordmark({ size = 20, dark = false }: { size?: number; dark?: boolean }) {
  return (
    <span style={{ fontSize: size, fontWeight: 800, letterSpacing: "-0.045em", color: dark ? "#FFFFFF" : "#12102A" }}>
      moya<span style={{ color: dark ? "#A996FF" : "#5B3DF5" }}>pay</span>
    </span>
  );
}

export function Logo({ href = "/", size = 32 }: { href?: string; size?: number }) {
  return (
    <Link href={href} aria-label="MoyaPay home" style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px" }}>
      <LogoTile size={size} />
      <Wordmark size={Math.round(size * 0.62)} />
    </Link>
  );
}
