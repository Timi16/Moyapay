import { z } from "zod";
import { parseAmount } from "../amount";

export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "INVALID_SIGNATURE",
  "CHALLENGE_EXPIRED",
  "ACCOUNT_NOT_FOUND",
  "NO_TRUSTLINE",
  "WEBHOOK_URL_REJECTED",
  "UNAUTHENTICATED",
  "FORBIDDEN_ORIGIN",
  "NOT_FOUND",
  "TX_NOT_FOUND",
  "INVALID_TRANSITION",
  "PAYMENT_NOT_ASSIGNABLE",
  "DESTINATION_CLAIMED",
  "LIMIT_REACHED",
  "PAYLOAD_TOO_LARGE",
  "TX_NOT_RELEVANT",
  "RATE_LIMITED",
  "INTERNAL",
  "HORIZON_UNAVAILABLE",
  "SERVICE_UNAVAILABLE",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const REQUEST_STATUSES = ["PENDING", "PAID", "FAILED", "EXPIRED"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
/** A request in one of these can still be paid. */
export const OPEN_STATUSES = ["PENDING", "FAILED"] as const satisfies readonly RequestStatus[];

export const PAYMENT_RESULTS = [
  "MATCHED",
  "UNMATCHED",
  "WRONG_AMOUNT",
  "WRONG_ASSET",
  "ALREADY_PAID",
  "LATE",
  "FAILED_TX",
] as const;
export type PaymentResult = (typeof PAYMENT_RESULTS)[number];

export const RESOLUTIONS = ["NONE", "ASSIGNED", "REFUNDED", "IGNORED"] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

/**
 * Results a merchant should look at: money arrived but did not settle a request. A failed
 * transaction moved nothing (only its fee), so it is not in this list.
 */
export const NEEDS_REVIEW_RESULTS = [
  "UNMATCHED",
  "WRONG_AMOUNT",
  "WRONG_ASSET",
  "ALREADY_PAID",
  "LATE",
] as const satisfies readonly PaymentResult[];

export const EVENT_TYPES = [
  "CREATED",
  "CHECKOUT_OPENED",
  "PAYMENT_SEEN",
  "PAID",
  "FAILED",
  "EXPIRED",
  "DUPLICATE_IGNORED",
  "FLAGGED",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const WEBHOOK_EVENTS = [
  "request.paid",
  "request.failed",
  "request.expired",
  "payment.unmatched",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.array(z.unknown()),
    requestId: z.string(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/** Decimal string, up to 12 integer digits and 7 decimals, > 0, fits in int64 stroops. */
export const AmountSchema = z
  .string({ invalid_type_error: "Amount must be a decimal string, e.g. \"50\" or \"12.5\"" })
  .trim()
  .regex(/^\d{1,12}(\.\d{1,7})?$/, "Amount must be a decimal string with at most 7 decimals")
  .refine((v) => {
    const s = parseAmount(v);
    return s !== null && s > 0n;
  }, "Amount must be greater than 0");

/** G… account id. The checksum is verified on the server with the Stellar SDK. */
export const StellarAddressSchema = z
  .string()
  .trim()
  .regex(/^G[A-Z2-7]{55}$/, "Must be a Stellar account address (G…)");

export const TxHashSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{64}$/, "Must be a 64-character transaction hash")
  .transform((v) => v.toLowerCase());

export const IdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid id");

export const IdParamsSchema = z.object({ id: IdSchema }).strict();

export const PaginationQuery = {
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(512).optional(),
};

export const FormatQuery = z.enum(["json", "csv"]).default("json");
