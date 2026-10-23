"use client";

import { HORIZON_URL, NETWORK_PASSPHRASE, USDC_ISSUER } from "./config";
import { signTransaction } from "./wallet";

export type PayErrorCode = "NO_ACCOUNT" | "NO_TRUSTLINE" | "NETWORK";

export class PayError extends Error {
  constructor(
    readonly code: PayErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PayError";
  }
}

export interface PayerAccount {
  address: string;
  hasTrustline: boolean;
  /** USDC balance as a decimal string, "0" without a trustline. */
  usdc: string;
}

async function sdk() {
  return import("@stellar/stellar-sdk");
}

export async function loadPayer(address: string): Promise<PayerAccount> {
  const { Horizon } = await sdk();
  const server = new Horizon.Server(HORIZON_URL);
  try {
    const account = await server.loadAccount(address);
    const line = account.balances.find(
      (b) => "asset_code" in b && b.asset_code === "USDC" && "asset_issuer" in b && b.asset_issuer === USDC_ISSUER,
    );
    return { address, hasTrustline: Boolean(line), usdc: line?.balance ?? "0" };
  } catch (err) {
    if ((err as { response?: { status?: number } }).response?.status === 404) {
      throw new PayError("NO_ACCOUNT", "This wallet isn't funded on Stellar Testnet yet. Fund it with Friendbot first.");
    }
    throw new PayError("NETWORK", "Couldn't reach Stellar. Check your connection and try again.");
  }
}

export interface Submitted {
  hash: string;
  /** false when Stellar rejected it; failed transactions that reached the ledger still have a hash. */
  ok: boolean;
  /** e.g. { transaction: "tx_failed", operations: ["op_underfunded"] } */
  codes: { transaction?: string; operations?: string[] } | null;
  /**
   * Horizon gave no verdict (timeout, dropped connection). The transaction may still land, so
   * the caller must check the hash rather than offer to pay again.
   */
  uncertain?: boolean;
}

async function signAndSubmit(walletId: string, address: string, build: (b: import("@stellar/stellar-sdk").TransactionBuilder) => void): Promise<Submitted> {
  const { Horizon, TransactionBuilder, BASE_FEE } = await sdk();
  const server = new Horizon.Server(HORIZON_URL);
  const account = await server.loadAccount(address);
  const builder = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE }).setTimeout(180);
  build(builder);
  const tx = builder.build();
  const signed = await signTransaction(walletId, address, tx.toXDR());
  const signedTx = TransactionBuilder.fromXDR(signed, NETWORK_PASSPHRASE);
  const hash = Array.from(signedTx.hash(), (b) => b.toString(16).padStart(2, "0")).join("");
  try {
    await server.submitTransaction(signedTx);
    return { hash, ok: true, codes: null };
  } catch (err) {
    const data = (err as { response?: { data?: { extras?: { result_codes?: Submitted["codes"] } } } }).response?.data;
    if (data?.extras) return { hash, ok: false, codes: data.extras.result_codes ?? null };
    return { hash, ok: false, codes: null, uncertain: true };
  }
}

/** The payment: exact USDC amount to the request's address with the reference as memo text. */
export async function payRequest(
  walletId: string,
  payer: string,
  p: { destination: string; amount: string; reference: string },
): Promise<Submitted> {
  const { Operation, Asset, Memo } = await sdk();
  return signAndSubmit(walletId, payer, (b) => {
    b.addOperation(Operation.payment({ destination: p.destination, asset: new Asset("USDC", USDC_ISSUER), amount: p.amount }));
    b.addMemo(Memo.text(p.reference));
  });
}

/** "Add USDC": a changeTrust the payer signs so their account can hold USDC. */
export async function addUsdcTrustline(walletId: string, payer: string): Promise<Submitted> {
  const { Operation, Asset } = await sdk();
  return signAndSubmit(walletId, payer, (b) => {
    b.addOperation(Operation.changeTrust({ asset: new Asset("USDC", USDC_ISSUER) }));
  });
}
