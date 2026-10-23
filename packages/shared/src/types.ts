import type {
  EventType,
  PaymentResult,
  RequestStatus,
  Resolution,
  WebhookEvent,
} from "./schemas/common";

// Response shapes of the MoyaPay API. Amounts are always 7-decimal strings, times ISO 8601.

export interface Asset {
  code: string;
  /** null = native XLM (only ever seen on incoming payments, never on a request) */
  issuer: string | null;
}

export interface Merchant {
  id: string;
  name: string;
  walletAddress: string;
  createdAt: string;
}

export interface PaymentRequest {
  id: string;
  reference: string;
  status: RequestStatus;
  amount: string;
  asset: Asset;
  destination: string;
  description: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  paidTxHash: string | null;
  failedReason: string | null;
  payUrl: string;
  createdVia: "dashboard" | "api";
  createdAt: string;
  updatedAt: string;
}

export interface RequestEvent {
  id: string;
  type: EventType;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface IncomingPayment {
  id: string;
  txHash: string;
  opId: string;
  ledger: number;
  ledgerClosedAt: string;
  from: string;
  to: string;
  asset: Asset;
  amount: string;
  memo: string | null;
  memoType: string;
  txSuccessful: boolean;
  resultCodes: ResultCodes | null;
  result: PaymentResult;
  reason: string;
  requestRef: string | null;
  resolution: Resolution;
  resolutionNote: string | null;
  resolvedAt: string | null;
  source: "watcher" | "verify";
  explorerUrl: string;
  createdAt: string;
}

export interface ResultCodes {
  transaction: string;
  operations: string[];
}

export type VerificationKey = "wallet" | "asset" | "amount" | "reference" | "tx_success";

export interface VerificationCheck {
  key: VerificationKey;
  label: string;
  ok: boolean;
  /** What the payment had. */
  value: string;
  /** What the request asked for. */
  expected: string;
}

export interface PaymentRequestDetail extends PaymentRequest {
  events: RequestEvent[];
  payments: IncomingPayment[];
  /**
   * The five checks against the payment that settled the request, or else the latest one
   * that tried to. null while no payment has arrived.
   */
  verification: { paymentId: string; checks: VerificationCheck[] } | null;
}

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

export interface WatcherStatus {
  network: "testnet";
  healthy: boolean;
  /** Latest ledger Horizon has closed, as last seen by the watcher. */
  latestLedger: number | null;
  latestLedgerAt: string | null;
  lastBeatAt: string | null;
  streams: { total: number; connected: number };
}

export interface Checkout {
  reference: string;
  status: RequestStatus;
  merchant: { name: string };
  amount: string;
  asset: Asset;
  destination: string;
  /** The memo the payer must attach: the reference itself. */
  memo: string;
  description: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  paidTxHash: string | null;
  failedReason: string | null;
  createdAt: string;
  /** The latest payment seen for this reference, for the problem states. */
  lastPayment: {
    result: PaymentResult;
    reason: string;
    amount: string;
    asset: Asset;
    txHash: string;
    txSuccessful: boolean;
    resultCodes: ResultCodes | null;
    ledgerClosedAt: string;
  } | null;
  network: { passphrase: string; horizonUrl: string };
  serverTime: string;
}

export interface Summary {
  collected30d: { amount: string; daily: { date: string; amount: string }[] };
  paid30d: number;
  /** Open requests (PENDING or FAILED) and the total they ask for. */
  pending: number;
  pendingAmount: string;
  needsReview: number;
  /** Results among the payments that need review, most common first. */
  needsReviewKinds: PaymentResult[];
  watcher: WatcherStatus;
}

export interface ActivityItem {
  id: string;
  kind: "request" | "payment";
  type: EventType | PaymentResult;
  reference: string | null;
  amount: string | null;
  txHash: string | null;
  message: string;
  at: string;
}

export interface ApiKey {
  id: string;
  name: string;
  /** First characters of the key, e.g. "mp_test_4fQa", for display. */
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface WebhookSettings {
  url: string | null;
  events: WebhookEvent[];
  /** Signing secret (whsec_…). Returned to the dashboard session only. */
  secret: string;
}

export interface WebhookDelivery {
  id: string;
  event: WebhookEvent | "ping";
  status: "PENDING" | "DELIVERED" | "FAILED";
  attempts: number;
  lastStatusCode: number | null;
  lastError: string | null;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface AccountCheck {
  address: string;
  exists: boolean;
  usdcTrustline: boolean;
  usdcBalance: string | null;
}

export interface Health {
  status: "ok" | "degraded";
  db: "up" | "down";
  network: "testnet";
  watcher: WatcherStatus | null;
  openRequests: number | null;
}

export type RequestCounts = Record<"ALL" | RequestStatus, number>;

export interface TransactionCounts {
  all: number;
  needsReview: number;
  matched: number;
  ignored: number;
  refunded: number;
  seenToday: number;
  duplicatesIgnored: number;
  byResult: Partial<Record<PaymentResult, number>>;
}

/** GET /transactions/:id */
export interface TransactionDetail extends IncomingPayment {
  request: PaymentRequest | null;
  checks: VerificationCheck[] | null;
}
