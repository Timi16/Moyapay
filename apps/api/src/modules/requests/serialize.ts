import type { IncomingPayment, Merchant, PaymentRequest, RequestEvent } from "@prisma/client";
import { normalizeReference } from "@moyapay/shared";
import type {
  Checkout,
  IncomingPayment as PaymentDto,
  PaymentRequest as RequestDto,
  RequestEvent as EventDto,
  ResultCodes,
  VerificationCheck,
} from "@moyapay/shared";
import { env } from "../../config/env";
import { describeAsset, explorerTxUrl } from "../../lib/asset";
import { describeResultCodes } from "../../lib/stellar/resultCodes";

export function payUrl(reference: string): string {
  return `${env.WEB_ORIGIN}/pay/${reference}`;
}

export function serializeRequest(r: PaymentRequest): RequestDto {
  return {
    id: r.id,
    reference: r.reference,
    status: r.status,
    amount: r.amount,
    asset: { code: r.assetCode, issuer: r.assetIssuer },
    destination: r.destination,
    description: r.description,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    paidAt: r.paidAt?.toISOString() ?? null,
    paidTxHash: r.paidTxHash,
    failedReason: r.failedReason,
    payUrl: payUrl(r.reference),
    createdVia: r.createdVia === "api" ? "api" : "dashboard",
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function resultCodesOf(p: Pick<IncomingPayment, "resultCodes">): ResultCodes | null {
  const v = p.resultCodes as { transaction?: unknown; operations?: unknown } | null;
  if (!v || typeof v.transaction !== "string" || !Array.isArray(v.operations)) return null;
  return { transaction: v.transaction, operations: v.operations.filter((o): o is string => typeof o === "string") };
}

export function serializePayment(p: IncomingPayment & { request?: { reference: string } | null }): PaymentDto {
  return {
    id: p.id,
    txHash: p.txHash,
    opId: p.opId,
    ledger: p.ledger,
    ledgerClosedAt: p.createdAtLedger.toISOString(),
    from: p.fromAddress,
    to: p.toAddress,
    asset: { code: p.assetCode, issuer: p.assetIssuer },
    amount: p.amount,
    memo: p.memo,
    memoType: p.memoType,
    txSuccessful: p.txSuccessful,
    resultCodes: resultCodesOf(p),
    result: p.result,
    reason: p.reason,
    requestRef: p.request?.reference ?? null,
    resolution: p.resolution,
    resolutionNote: p.resolutionNote,
    resolvedAt: p.resolvedAt?.toISOString() ?? null,
    source: p.source === "verify" ? "verify" : "watcher",
    explorerUrl: explorerTxUrl(p.txHash),
    createdAt: p.createdAt.toISOString(),
  };
}

export function serializeEvent(e: RequestEvent): EventDto {
  return {
    id: e.id,
    type: e.type,
    data: (e.data ?? {}) as Record<string, unknown>,
    createdAt: e.createdAt.toISOString(),
  };
}

/**
 * The five checks shown on the request page (wallet, asset, amount, reference, tx success),
 * each with the value the payment had and the value the request asked for.
 */
export function verificationChecks(req: PaymentRequest, p: IncomingPayment): VerificationCheck[] {
  const wanted = { code: req.assetCode, issuer: req.assetIssuer };
  const got = { code: p.assetCode, issuer: p.assetIssuer };
  const codes = resultCodesOf(p);
  return [
    { key: "wallet", label: "Recipient wallet", ok: p.toAddress === req.destination, value: p.toAddress, expected: req.destination },
    {
      key: "asset",
      label: "Asset",
      ok: got.code === wanted.code && got.issuer === wanted.issuer,
      value: describeAsset(got),
      expected: describeAsset(wanted),
    },
    { key: "amount", label: "Amount", ok: p.amountStroops === req.amountStroops, value: p.amount, expected: req.amount },
    {
      key: "reference",
      label: "Reference",
      ok: p.memoType === "text" && normalizeReference(p.memo ?? "") === req.reference,
      value: p.memo ?? "(no memo)",
      expected: req.reference,
    },
    {
      key: "tx_success",
      label: "Transaction succeeded",
      ok: p.txSuccessful,
      value: p.txSuccessful ? "Successful" : `Failed (${describeResultCodes(codes)})`,
      expected: "Successful",
    },
  ];
}

export function serializeCheckout(
  r: PaymentRequest,
  merchant: Pick<Merchant, "name">,
  last: IncomingPayment | null,
): Checkout {
  return {
    reference: r.reference,
    status: r.status,
    merchant: { name: merchant.name },
    amount: r.amount,
    asset: { code: r.assetCode, issuer: r.assetIssuer },
    destination: r.destination,
    memo: r.reference,
    description: r.description,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    paidAt: r.paidAt?.toISOString() ?? null,
    paidTxHash: r.paidTxHash,
    failedReason: r.failedReason,
    createdAt: r.createdAt.toISOString(),
    lastPayment: last
      ? {
          result: last.result,
          reason: last.reason,
          amount: last.amount,
          asset: { code: last.assetCode, issuer: last.assetIssuer },
          txHash: last.txHash,
          txSuccessful: last.txSuccessful,
          resultCodes: resultCodesOf(last),
          ledgerClosedAt: last.createdAtLedger.toISOString(),
        }
      : null,
    network: { passphrase: env.NETWORK_PASSPHRASE, horizonUrl: env.HORIZON_URL },
    serverTime: new Date().toISOString(),
  };
}
