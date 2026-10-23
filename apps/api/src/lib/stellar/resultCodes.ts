import { xdr } from "@stellar/stellar-sdk";
import type { ResultCodes } from "@moyapay/shared";

function snake(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/** "paymentUnderfunded" for a payment op -> "op_underfunded", the code Horizon shows. */
function opCode(result: xdr.OperationResult): string {
  // "opInner" | "opBadAuth" | "opNoAccount" | …
  if (result.type !== "opInner") return snake(result.type);
  const opType: string = result.tr.type; // "payment", "pathPaymentStrictSend", …
  const inner = (result.tr.value as { type?: unknown }).type;
  const name = typeof inner === "string" ? inner : "unknown";
  const rest = name.startsWith(opType) ? name.slice(opType.length) : name;
  return `op_${snake(rest.charAt(0).toLowerCase() + rest.slice(1))}`;
}

/**
 * Decodes a transaction's result XDR into Horizon-style result codes, e.g.
 * { transaction: "tx_failed", operations: ["op_underfunded"] }. A fee-bump reports the inner
 * transaction's codes. Returns null when the XDR cannot be read.
 */
export function decodeResultCodes(resultXdr: string | undefined): ResultCodes | null {
  if (!resultXdr) return null;
  try {
    const outer = xdr.TransactionResult.fromXdr(resultXdr, "base64").result;
    const result =
      outer.type === "txFeeBumpInnerFailed" || outer.type === "txFeeBumpInnerSuccess"
        ? outer.innerResultPair.result.result
        : outer;
    const operations = result.type === "txFailed" || result.type === "txSuccess" ? result.results.map(opCode) : [];
    return { transaction: snake(result.type), operations };
  } catch {
    return null;
  }
}

export function describeResultCodes(codes: ResultCodes | null): string {
  if (!codes) return "unknown result";
  const ops = codes.operations.filter((c) => c !== "op_success");
  return ops.length > 0 ? `${codes.transaction}: ${ops.join(", ")}` : codes.transaction;
}
