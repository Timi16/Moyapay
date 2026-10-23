import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { generateReference } from "../../src/lib/ids";
import { buildChallenge, verifySignedChallenge } from "../../src/lib/stellar/challenge";
import { cursorForLedger, ledgerOfPagingToken } from "../../src/lib/stellar/horizon";
import { decodeResultCodes, describeResultCodes } from "../../src/lib/stellar/resultCodes";
import { verifyWalletSignature } from "../../src/lib/stellar/signature";
import { REFERENCE_REGEX } from "@moyapay/shared";
import { failedResultXdr } from "../helpers/fakes";

describe("references", () => {
  it("are MP- plus 6 characters with no 0, O, 1, I, L or U", () => {
    for (let i = 0; i < 2000; i++) {
      const ref = generateReference();
      expect(ref).toMatch(REFERENCE_REGEX);
      expect(ref.slice(3)).not.toMatch(/[01OILU]/);
    }
  });

  it("fit in a 28-byte memo_text", () => {
    expect(Buffer.byteLength(generateReference(), "utf8")).toBeLessThanOrEqual(28);
  });
});

describe("result codes", () => {
  it("decodes a failed payment to Horizon-style codes", () => {
    const codes = decodeResultCodes(failedResultXdr());
    expect(codes).toEqual({ transaction: "tx_failed", operations: ["op_underfunded"] });
    expect(describeResultCodes(codes)).toBe("tx_failed: op_underfunded");
  });

  it("returns null for missing or broken XDR", () => {
    expect(decodeResultCodes(undefined)).toBeNull();
    expect(decodeResultCodes("not-xdr")).toBeNull();
  });
});

describe("paging tokens", () => {
  it("cursorForLedger and ledgerOfPagingToken round-trip", () => {
    expect(ledgerOfPagingToken(cursorForLedger(123456))).toBe(123456);
    expect(ledgerOfPagingToken("abc")).toBeNull();
  });
});

describe("sign-in challenge", () => {
  const kp = Keypair.random();
  const c = buildChallenge(kp.publicKey(), "nonce-123", Networks.TESTNET, new Date());

  it("the SEP-53 message signature verifies for the right wallet only", () => {
    const sig = Buffer.from(kp.signMessage(c.message)).toString("base64");
    expect(verifyWalletSignature(kp.publicKey(), c.message, sig)).toBe(true);
    expect(verifyWalletSignature(Keypair.random().publicKey(), c.message, sig)).toBe(false);
    expect(verifyWalletSignature(kp.publicKey(), `${c.message}x`, sig)).toBe(false);
  });

  it("the signed challenge transaction verifies, and a different or unsigned one does not", () => {
    const tx = TransactionBuilder.fromXDR(c.transaction, Networks.TESTNET);
    expect(verifySignedChallenge(tx.toXDR(), c.txHash, kp.publicKey(), Networks.TESTNET)).toBe(false); // unsigned
    tx.sign(kp);
    expect(verifySignedChallenge(tx.toXDR(), c.txHash, kp.publicKey(), Networks.TESTNET)).toBe(true);

    const other = TransactionBuilder.fromXDR(c.transaction, Networks.TESTNET);
    other.sign(Keypair.random());
    expect(verifySignedChallenge(other.toXDR(), c.txHash, kp.publicKey(), Networks.TESTNET)).toBe(false);

    const second = buildChallenge(kp.publicKey(), "nonce-456", Networks.TESTNET, new Date());
    const replay = TransactionBuilder.fromXDR(second.transaction, Networks.TESTNET);
    replay.sign(kp);
    expect(verifySignedChallenge(replay.toXDR(), c.txHash, kp.publicKey(), Networks.TESTNET)).toBe(false);
  });

  it("the challenge transaction can never be submitted (sequence 0)", () => {
    const tx = TransactionBuilder.fromXDR(c.transaction, Networks.TESTNET);
    expect("sequence" in tx ? tx.sequence : null).toBe("0");
  });
});
