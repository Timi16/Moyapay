import type { WalletOption } from "@/lib/wallet";

/** The wallet's own logo (from Stellar Wallets Kit, served from /wallets). */
export function WalletLogo({ wallet, size = 36 }: { wallet: Pick<WalletOption, "name" | "icon" | "tile">; size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        flex: "0 0 auto",
        borderRadius: Math.round(size * 0.3),
        overflow: "hidden",
        background: wallet.tile ?? "transparent",
        boxShadow: wallet.tile ? "inset 0 0 0 1px #ECEAF5" : undefined,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <img
        src={wallet.icon}
        alt=""
        width={size}
        height={size}
        style={{ width: wallet.tile ? "72%" : "100%", height: wallet.tile ? "72%" : "100%", objectFit: "contain", display: "block" }}
      />
    </span>
  );
}
