import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { decide, referenceOf, type RequestFacts } from "../../src/engine/matcher";
import type { IncomingOp } from "../../src/engine/types";
import { formatStroops, parseAmount } from "../../src/lib/amount";
import { USDC_ISSUER } from "../helpers/setupEnv";

const MERCHANT = "merchant_1";
const DEST = Keypair.random().publicKey();
const EXPIRES = new Date("2026-10-23T12:00:00Z");
const BEFORE = new Date("2026-10-23T11:00:00Z");
const AFTER = new Date("2026-10-23T12:00:05Z");

function request(over: Partial<RequestFacts> = {}): RequestFacts {
  return {
    id: "req_1",
    reference: "MP-7KQ2XF",
    merchantId: MERCHANT,
    destination: DEST,
    assetCode: "USDC",
    assetIssuer: USDC_ISSUER,
    amount: "50.0000000",
    amountStroops: 500_000_000n,
    status: "PENDING",
    expiresAt: EXPIRES,
    paidTxHash: null,
    ...over,
  };
}

function payment(over: Partial<IncomingOp> & { amount?: string } = {}): IncomingOp {
  const amount = over.amount ?? "50";
  const stroops = parseAmount(amount) ?? 0n;
  return {
    txHash: "a".repeat(64),
    opId: "123",
    pagingToken: "123",
    opType: "payment",
    ledger: 100,
    ledgerClosedAt: BEFORE,
    from: Keypair.random().publicKey(),
    to: DEST,
    asset: { code: "USDC", issuer: USDC_ISSUER },
    memo: "MP-7KQ2XF",
    memoType: "text",
    txSuccessful: true,
    resultCodes: null,
    ...over,
    amount: formatStroops(stroops),
    amountStroops: stroops,
  };
}

// One row per line of the decision table in the build plan (Step 5), in its order.
const TABLE: {
  row: string;
  op: IncomingOp;
  req: RequestFacts | null;
  result: string;
  effect: string;
  reason: RegExp;
}[] = [
  {
    row: "1 transaction failed -> FAILED_TX, PENDING request -> FAILED",
    op: payment({ txSuccessful: false, resultCodes: { transaction: "tx_failed", operations: ["op_underfunded"] } }),
    req: request(),
    result: "FAILED_TX",
    effect: "FAILED",
    reason: /tx_failed: op_underfunded/,
  },
  {
    row: "2 no memo -> UNMATCHED",
    op: payment({ memo: null, memoType: "none" }),
    req: null,
    result: "UNMATCHED",
    effect: "NONE",
    reason: /No memo/,
  },
  {
    row: "2 memo is not a known reference for this merchant -> UNMATCHED",
    op: payment({ memo: "MP-7KQ2XF" }),
    req: request({ merchantId: "someone_else" }),
    result: "UNMATCHED",
    effect: "NONE",
    reason: /not one of this merchant's/,
  },
  {
    row: "3 request already PAID -> ALREADY_PAID",
    op: payment(),
    req: request({ status: "PAID", paidTxHash: "b".repeat(64) }),
    result: "ALREADY_PAID",
    effect: "NONE",
    reason: /already paid by transaction bbbbbbbb/,
  },
  {
    row: "4 request EXPIRED -> LATE",
    op: payment(),
    req: request({ status: "EXPIRED" }),
    result: "LATE",
    effect: "NONE",
    reason: /after MP-7KQ2XF expired/,
  },
  {
    row: "4 ledger close time after expiresAt (request still PENDING) -> LATE",
    op: payment({ ledgerClosedAt: AFTER }),
    req: request(),
    result: "LATE",
    effect: "NONE",
    reason: /Arrived 2026-10-23T12:00:05/,
  },
  {
    row: "5 wrong asset (XLM) -> WRONG_ASSET",
    op: payment({ asset: { code: "XLM", issuer: null } }),
    req: request(),
    result: "WRONG_ASSET",
    effect: "NONE",
    reason: /Sent XLM \(native\)/,
  },
  {
    row: "6 wrong amount (short) -> WRONG_AMOUNT, underpaid",
    op: payment({ amount: "49.5" }),
    req: request(),
    result: "WRONG_AMOUNT",
    effect: "NONE",
    reason: /Underpaid by 0\.5000000 USDC: sent 49\.5000000, expected 50\.0000000/,
  },
  {
    row: "7 everything checks out -> MATCHED -> PAID",
    op: payment(),
    req: request(),
    result: "MATCHED",
    effect: "PAID",
    reason: /all check out/,
  },
];

describe("decide(): the Step 5 decision table", () => {
  it.each(TABLE)("$row", ({ op, req, result, effect, reason }) => {
    const d = decide(op, req, MERCHANT);
    expect(d.result).toBe(result);
    expect(d.effect).toBe(effect);
    expect(d.reason).toMatch(reason);
  });

  it("checks in order: a failed transaction wins over every other problem", () => {
    const d = decide(payment({ txSuccessful: false, memo: null, memoType: "none", amount: "1" }), null, MERCHANT);
    expect(d.result).toBe("FAILED_TX");
    expect(d.effect).toBe("NONE"); // no request to fail
  });

  it("checks in order: ALREADY_PAID wins over a wrong amount", () => {
    expect(decide(payment({ amount: "1" }), request({ status: "PAID" }), MERCHANT).result).toBe("ALREADY_PAID");
  });

  it("checks in order: LATE wins over a wrong asset", () => {
    const d = decide(payment({ ledgerClosedAt: AFTER, asset: { code: "XLM", issuer: null } }), request(), MERCHANT);
    expect(d.result).toBe("LATE");
  });

  it("a FAILED request can still be paid", () => {
    expect(decide(payment(), request({ status: "FAILED" }), MERCHANT)).toMatchObject({ result: "MATCHED", effect: "PAID" });
  });

  it("a failed transaction against an already PAID request flags it but changes nothing", () => {
    const d = decide(payment({ txSuccessful: false }), request({ status: "PAID" }), MERCHANT);
    expect(d).toMatchObject({ result: "FAILED_TX", effect: "NONE", linked: true });
  });

  it("a failed transaction after expiry does not fail the request", () => {
    expect(decide(payment({ txSuccessful: false, ledgerClosedAt: AFTER }), request(), MERCHANT).effect).toBe("NONE");
  });

  it("a request that never expires accepts payment at any time", () => {
    const late = payment({ ledgerClosedAt: new Date("2030-01-01T00:00:00Z") });
    expect(decide(late, request({ expiresAt: null }), MERCHANT).result).toBe("MATCHED");
  });

  it("paid exactly at expiresAt is in time (the boundary belongs to the payer)", () => {
    expect(decide(payment({ ledgerClosedAt: EXPIRES }), request(), MERCHANT).result).toBe("MATCHED");
  });

  it("USDC from another issuer (a look-alike) is WRONG_ASSET", () => {
    const fake = Keypair.random().publicKey();
    const d = decide(payment({ asset: { code: "USDC", issuer: fake } }), request(), MERCHANT);
    expect(d.result).toBe("WRONG_ASSET");
    expect(d.reason).toContain(`issuer ${fake.slice(0, 4)}`);
  });

  it("overpaying is WRONG_AMOUNT with 'Overpaid' in the reason", () => {
    const d = decide(payment({ amount: "50.0000001" }), request(), MERCHANT);
    expect(d.result).toBe("WRONG_AMOUNT");
    expect(d.reason).toMatch(/^Overpaid by 0\.0000001 USDC/);
  });

  it("a reference for another address of the same merchant is UNMATCHED and not linked", () => {
    const other = Keypair.random().publicKey();
    const d = decide(payment({ to: other }), request(), MERCHANT);
    expect(d).toMatchObject({ result: "UNMATCHED", linked: false });
    expect(d.reason).toContain("asks to be paid to");
  });
});

describe("amount precision (integer stroops, never floats)", () => {
  it.each([
    ["50", "MATCHED"],
    ["50.0000000", "MATCHED"],
    ["50.0", "MATCHED"],
    ["49.9999999", "WRONG_AMOUNT"],
    ["50.0000001", "WRONG_AMOUNT"],
  ])("paying %s for a 50 USDC request -> %s", (amount, result) => {
    expect(decide(payment({ amount }), request(), MERCHANT).result).toBe(result);
  });

  it("0.1 + 0.2 style amounts compare exactly", () => {
    const req = request({ amount: "0.3000000", amountStroops: 3_000_000n });
    expect(decide(payment({ amount: "0.3" }), req, MERCHANT).result).toBe("MATCHED");
  });
});

describe("memo handling", () => {
  it.each([
    ["mp-7kq2xf", "MP-7KQ2XF"],
    ["  MP-7KQ2XF  ", "MP-7KQ2XF"],
    [" mp-7kq2xf\t", "MP-7KQ2XF"],
    ["MP7KQ2XF", "MP-7KQ2XF"],
    ["MP - 7KQ2XF", "MP-7KQ2XF"],
  ])("%j is read as %s", (memo, ref) => {
    expect(referenceOf({ memo, memoType: "text" }).reference).toBe(ref);
    expect(decide(payment({ memo }), request(), MERCHANT).result).toBe("MATCHED");
  });

  it.each([
    ["MP-7KQ2X", "too short"],
    ["MP-7KQ2XO", "too long"],
    ["MP-7KQ2X0", "0 is not in the alphabet"],
    ["MP-7KQ2XI", "I is not in the alphabet"],
    ["order 1234", "not a reference"],
  ])("%j is not a reference (%s)", (memo) => {
    expect(referenceOf({ memo, memoType: "text" }).reference).toBeNull();
  });

  it("an id or hash memo is UNMATCHED with the memo type in the reason", () => {
    expect(referenceOf({ memo: "12345", memoType: "id" }).problem).toBe("The memo is a id memo, not a text reference");
    const d = decide(payment({ memo: "ab".repeat(32), memoType: "hash" }), null, MERCHANT);
    expect(d.result).toBe("UNMATCHED");
  });
});

describe("path payments", () => {
  it("a path payment is matched on the amount received", () => {
    const d = decide(payment({ opType: "path_payment_strict_send", amount: "50" }), request(), MERCHANT);
    expect(d.result).toBe("MATCHED");
  });

  it("a strict-receive path payment of the wrong destination amount is WRONG_AMOUNT", () => {
    const d = decide(payment({ opType: "path_payment_strict_receive", amount: "40" }), request(), MERCHANT);
    expect(d.result).toBe("WRONG_AMOUNT");
  });
});
