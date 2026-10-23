import { env } from "../config/env";

export interface AssetRef {
  code: string;
  /** null = native XLM */
  issuer: string | null;
}

/** Every payment request asks for this asset: Circle's testnet USDC. */
export function usdc(): { code: "USDC"; issuer: string } {
  return { code: "USDC", issuer: env.USDC_ISSUER };
}

export function sameAsset(a: AssetRef, b: AssetRef): boolean {
  return a.code === b.code && (a.issuer ?? null) === (b.issuer ?? null);
}

export function describeAsset(a: AssetRef): string {
  if (a.issuer === null) return "XLM (native)";
  return `${a.code} (issuer ${a.issuer.slice(0, 4)}…${a.issuer.slice(-4)})`;
}

export function explorerTxUrl(hash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}
