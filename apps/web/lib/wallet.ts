"use client";

import { NETWORK_PASSPHRASE } from "./config";

// Stellar Wallets Kit (v2): Freighter, xBull, LOBSTR and Albedo. The kit touches browser
// globals when it loads, so it is imported only when a wallet is actually used.

export interface WalletOption {
  id: string;
  name: string;
  /** The wallet's logo, from Stellar Wallets Kit (copied to public/wallets). */
  icon: string;
  /** Background for logos drawn on transparency. */
  tile?: string;
  available: boolean;
  url: string;
}

const LOOK: Record<string, { name: string; icon: string; tile?: string }> = {
  freighter: { name: "Freighter", icon: "/wallets/freighter.png" },
  xbull: { name: "xBull", icon: "/wallets/xbull.png" },
  lobstr: { name: "LOBSTR", icon: "/wallets/lobstr.png" },
  albedo: { name: "Albedo", icon: "/wallets/albedo.png", tile: "#FFFFFF" },
};
const ORDER = ["freighter", "xbull", "lobstr", "albedo"];

type Kit = typeof import("@creit.tech/stellar-wallets-kit").StellarWalletsKit;
let kitPromise: Promise<Kit> | null = null;

async function kit(): Promise<Kit> {
  kitPromise ??= (async () => {
    const [{ StellarWalletsKit }, { Networks }, { FreighterModule }, { xBullModule }, { LobstrModule }, { AlbedoModule }] =
      await Promise.all([
        import("@creit.tech/stellar-wallets-kit"),
        import("@creit.tech/stellar-wallets-kit/types"),
        import("@creit.tech/stellar-wallets-kit/modules/freighter"),
        import("@creit.tech/stellar-wallets-kit/modules/xbull"),
        import("@creit.tech/stellar-wallets-kit/modules/lobstr"),
        import("@creit.tech/stellar-wallets-kit/modules/albedo"),
      ]);
    StellarWalletsKit.init({
      modules: [new FreighterModule(), new xBullModule(), new LobstrModule(), new AlbedoModule()],
      network: Networks.TESTNET,
    });
    return StellarWalletsKit;
  })();
  return kitPromise;
}

export class WalletError extends Error {
  constructor(
    readonly code: "REJECTED" | "NOT_AVAILABLE" | "WRONG_ACCOUNT" | "FAILED",
    message: string,
  ) {
    super(message);
    this.name = "WalletError";
  }
}

function toWalletError(err: unknown, wallet: string): WalletError {
  if (err instanceof WalletError) return err;
  const text =
    typeof err === "string" ? err : ((err as { message?: string; ext?: string } | null)?.message ?? JSON.stringify(err ?? ""));
  if (/declin|reject|denied|cancel|closed|user/i.test(text)) {
    return new WalletError("REJECTED", `You cancelled in ${wallet}. Try again when you're ready.`);
  }
  return new WalletError("FAILED", `${wallet} couldn't complete that: ${text.slice(0, 160)}`);
}

export async function listWallets(): Promise<WalletOption[]> {
  const k = await kit();
  const supported = await k.refreshSupportedWallets();
  return ORDER.map((id) => {
    const found = supported.find((w) => w.id === id);
    const look = LOOK[id] ?? { name: id, icon: found?.icon ?? "" };
    return { id, ...look, available: found?.isAvailable ?? false, url: found?.url ?? "" };
  });
}

export const walletName = (id: string) => LOOK[id]?.name ?? id;

/** Selects the wallet and asks it for the account address. */
export async function connect(walletId: string): Promise<string> {
  const k = await kit();
  try {
    k.setWallet(walletId);
    const { address } = await k.getAddress();
    return address;
  } catch (err) {
    throw toWalletError(err, walletName(walletId));
  }
}

/** SEP-53 message signature, base64. Throws NOT_AVAILABLE when the wallet can't sign messages. */
export async function signMessage(walletId: string, address: string, message: string): Promise<string> {
  const k = await kit();
  try {
    const { signedMessage, signerAddress } = await k.signMessage(message, { address, networkPassphrase: NETWORK_PASSPHRASE });
    if (signerAddress && signerAddress !== address) {
      throw new WalletError("WRONG_ACCOUNT", `${walletName(walletId)} signed with a different account.`);
    }
    if (!signedMessage) throw new WalletError("NOT_AVAILABLE", "No signature returned");
    return signedMessage;
  } catch (err) {
    const e = toWalletError(err, walletName(walletId));
    if (e.code === "FAILED" && /not (supported|implemented)|does not support/i.test(e.message)) {
      throw new WalletError("NOT_AVAILABLE", e.message);
    }
    throw e;
  }
}

export async function signTransaction(walletId: string, address: string, xdr: string): Promise<string> {
  const k = await kit();
  try {
    const { signedTxXdr } = await k.signTransaction(xdr, { address, networkPassphrase: NETWORK_PASSPHRASE });
    return signedTxXdr;
  } catch (err) {
    throw toWalletError(err, walletName(walletId));
  }
}
