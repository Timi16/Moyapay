import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EnvSchema, loadEnv } from "../../src/config/env";
import { decodePaymentRecord, isSkip } from "../../src/engine/decode";
import { toCsv } from "../../src/lib/csv";
import { signPayload, verifySignature } from "../../src/lib/hmac";
import { webhookHeaders } from "../../src/engine/webhookDelivery";
import { normalizeReference, parseAmount, formatStroops } from "@moyapay/shared";
import { failedResultXdr, paymentRecord, randomAddress } from "../helpers/fakes";

describe(".env.example", () => {
  it("lists every variable config/env.ts reads", () => {
    const example = readFileSync(resolve(__dirname, "../../../../.env.example"), "utf8");
    for (const key of Object.keys(EnvSchema.shape)) expect(example).toMatch(new RegExp(`^${key}=`, "m"));
  });

  it("refuses any network but testnet", () => {
    expect(() =>
      loadEnv({ ...process.env, NETWORK_PASSPHRASE: "Public Global Stellar Network ; September 2015" }),
    ).toThrow(/testnet passphrase/);
  });
});

describe("amounts", () => {
  it("parse and format without floats", () => {
    expect(parseAmount("50")).toBe(500_000_000n);
    expect(parseAmount("0.0000001")).toBe(1n);
    expect(parseAmount("1.00000001")).toBeNull();
    expect(parseAmount("-1")).toBeNull();
    expect(parseAmount("1e3")).toBeNull();
    expect(formatStroops(500_000_000n)).toBe("50.0000000");
  });

  it("normalizeReference rejects junk", () => {
    expect(normalizeReference("")).toBeNull();
    expect(normalizeReference("MP-")).toBeNull();
  });
});

describe("decodePaymentRecord", () => {
  const dest = randomAddress();

  it("decodes an incoming USDC payment with its memo and ledger time", () => {
    const rec = paymentRecord({ to: dest, amount: "12.5", memo: "mp-7kq2xf" });
    const op = decodePaymentRecord(rec, dest);
    expect(isSkip(op)).toBe(false);
    if (isSkip(op)) return;
    expect(op).toMatchObject({ amount: "12.5000000", amountStroops: 125_000_000n, memo: "mp-7kq2xf", memoType: "text" });
    expect(op.ledgerClosedAt.toISOString()).toBe(new Date(rec.created_at).toISOString());
  });

  it("skips outgoing payments, other operation types and payments to someone else", () => {
    expect(decodePaymentRecord(paymentRecord({ to: randomAddress(), from: dest }), dest)).toEqual({ skip: "outgoing" });
    expect(decodePaymentRecord(paymentRecord({ to: dest, type: "create_account" }), dest)).toEqual({ skip: "not_a_payment" });
    expect(decodePaymentRecord(paymentRecord({ to: randomAddress() }), dest)).toEqual({ skip: "not_incoming" });
  });

  it("decodes a failed transaction with its result codes", () => {
    const op = decodePaymentRecord(paymentRecord({ to: dest, successful: false, resultXdr: failedResultXdr() }), dest);
    if (isSkip(op)) throw new Error("skipped");
    expect(op.txSuccessful).toBe(false);
    expect(op.resultCodes).toEqual({ transaction: "tx_failed", operations: ["op_underfunded"] });
  });

  it("decodes XLM and path payments", () => {
    const xlm = decodePaymentRecord(paymentRecord({ to: dest, asset: "XLM" }), dest);
    const path = decodePaymentRecord(paymentRecord({ to: dest, type: "path_payment_strict_send" }), dest);
    if (isSkip(xlm) || isSkip(path)) throw new Error("skipped");
    expect(xlm.asset).toEqual({ code: "XLM", issuer: null });
    expect(path.opType).toBe("path_payment_strict_send");
  });

  it("strips NUL bytes from memos", () => {
    const op = decodePaymentRecord(paymentRecord({ to: dest, memo: "MP-7KQ2XF\u0000" }), dest);
    if (isSkip(op)) throw new Error("skipped");
    expect(op.memo).toBe("MP-7KQ2XF");
  });
});

describe("webhook signatures", () => {
  it("v1 = HMAC-SHA256(secret, timestamp.body), verifiable by the receiver", () => {
    const body = JSON.stringify({ id: "evt_1", type: "request.paid" });
    const ts = Math.floor(Date.now() / 1000);
    const headers = webhookHeaders("whsec_test", "evt_1", 1, body, ts);
    expect(headers["MoyaPay-Signature"]).toBe(`v1=${signPayload("whsec_test", ts, body)}`);
    expect(verifySignature("whsec_test", headers["MoyaPay-Signature"], String(ts), body)).toBe(true);
    expect(verifySignature("whsec_other", headers["MoyaPay-Signature"], String(ts), body)).toBe(false);
    expect(verifySignature("whsec_test", headers["MoyaPay-Signature"], String(ts - 3600), body)).toBe(false);
  });
});

describe("csv", () => {
  it("quotes, escapes and defuses formulas", () => {
    expect(toCsv(["a", "b"], [["x,y", '=SUM(A1)'], ['say "hi"', null]])).toBe('a,b\r\n"x,y",\'=SUM(A1)\r\n"say ""hi""",\r\n');
  });
});
