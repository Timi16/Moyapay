import { Account, FeeBumpTransaction, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

export const CHALLENGE_TTL_MS = 5 * 60_000;
const DATA_NAME = "moyapay auth";

export interface Challenge {
  message: string;
  /** base64 XDR of a transaction that can never be submitted (sequence number 0). */
  transaction: string;
  txHash: string;
}

/**
 * Two equivalent proofs of the wallet, so every wallet can sign in:
 * - `message`, signed with SEP-53 (Freighter, xBull and Albedo support signMessage);
 * - a SEP-10-style transaction: source = the wallet, sequence 0, one manageData op carrying
 *   the nonce, valid for 5 minutes. Wallets that only sign transactions (LOBSTR) sign this.
 *   Sequence 0 means it fails if anyone ever submits it, so signing it moves nothing.
 */
export function buildChallenge(
  address: string,
  nonce: string,
  networkPassphrase: string,
  now: Date,
): Challenge {
  const expires = new Date(now.getTime() + CHALLENGE_TTL_MS);
  const message = [
    "MoyaPay sign-in",
    `Wallet: ${address}`,
    `Nonce: ${nonce}`,
    `Issued: ${now.toISOString()}`,
    `Expires: ${expires.toISOString()}`,
    "Network: Stellar Testnet",
  ].join("\n");

  const tx = new TransactionBuilder(new Account(address, "-1"), {
    fee: "100",
    networkPassphrase,
    timebounds: { minTime: Math.floor(now.getTime() / 1000), maxTime: Math.floor(expires.getTime() / 1000) },
  })
    .addOperation(Operation.manageData({ name: DATA_NAME, value: nonce, source: address }))
    .build();
  return { message, transaction: tx.toXDR(), txHash: Buffer.from(tx.hash()).toString("hex") };
}

/**
 * True when `signedXdr` is exactly the challenge transaction (same hash) and carries a valid
 * signature from `address`.
 */
export function verifySignedChallenge(
  signedXdr: string,
  expectedHash: string,
  address: string,
  networkPassphrase: string,
): boolean {
  try {
    const tx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
    if (tx instanceof FeeBumpTransaction) return false;
    const hash = tx.hash();
    if (Buffer.from(hash).toString("hex") !== expectedHash) return false;
    const key = Keypair.fromPublicKey(address);
    return tx.signatures.some((sig) => {
      try {
        return key.verify(hash, sig.signature);
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}
