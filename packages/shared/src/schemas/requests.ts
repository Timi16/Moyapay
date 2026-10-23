import { z } from "zod";
import { REFERENCE_REGEX } from "../reference";
import {
  AmountSchema,
  FormatQuery,
  PaginationQuery,
  PAYMENT_RESULTS,
  REQUEST_STATUSES,
  StellarAddressSchema,
  TxHashSchema,
} from "./common";

/** The dashboard's expiry choices, in seconds. "Never" is `expiresIn: null`. */
export const EXPIRY_PRESETS = { "1h": 3600, "24h": 86_400, "7d": 604_800 } as const;
export const DEFAULT_EXPIRES_IN = EXPIRY_PRESETS["24h"];
export const MIN_EXPIRES_IN = 60;
export const MAX_EXPIRES_IN = 30 * 86_400;

export const ReferenceSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .refine((v) => REFERENCE_REGEX.test(v), "Must be a payment reference like MP-7KQ2XF");

export const RefParamsSchema = z.object({ ref: ReferenceSchema }).strict();

export const CreatePaymentRequestBody = z
  .object({
    amount: AmountSchema,
    description: z.string().trim().max(140, "Description is at most 140 characters").optional(),
    /** Defaults to the merchant's wallet. */
    destination: StellarAddressSchema.optional(),
    /** Seconds until the request expires; null = never; omitted = 24 hours. */
    expiresIn: z
      .number()
      .int()
      .min(MIN_EXPIRES_IN, `expiresIn is at least ${MIN_EXPIRES_IN} seconds`)
      .max(MAX_EXPIRES_IN, "expiresIn is at most 30 days")
      .nullable()
      .optional(),
  })
  .strict();
export type CreatePaymentRequestInput = z.infer<typeof CreatePaymentRequestBody>;

export const ListRequestsQuery = z
  .object({
    status: z.enum(REQUEST_STATUSES).optional(),
    /** A reference (or part of one) or a transaction hash (or its start). */
    q: z.string().trim().min(1).max(64).optional(),
    format: FormatQuery,
    ...PaginationQuery,
  })
  .strict();

export const VerifyBody = z.object({ txHash: TxHashSchema }).strict();

/**
 * Reconciliation tabs. needs_review: money arrived but settled nothing and nobody has
 * resolved it yet. matched: settled a request (automatically or by assignment).
 */
export const TRANSACTION_VIEWS = ["all", "needs_review", "matched", "ignored", "refunded"] as const;
export type TransactionView = (typeof TRANSACTION_VIEWS)[number];

export const ListTransactionsQuery = z
  .object({
    result: z.enum(PAYMENT_RESULTS).optional(),
    view: z.enum(TRANSACTION_VIEWS).default("all"),
    q: z.string().trim().min(1).max(64).optional(),
    format: FormatQuery,
    ...PaginationQuery,
  })
  .strict();

const Note = z.string().trim().max(280).optional();

export const PatchTransactionBody = z.discriminatedUnion("resolution", [
  z.object({ resolution: z.literal("ASSIGNED"), requestRef: ReferenceSchema, note: Note }).strict(),
  z.object({ resolution: z.literal("REFUNDED"), note: Note }).strict(),
  z.object({ resolution: z.literal("IGNORED"), note: Note }).strict(),
  /** Reopens a payment marked refunded or ignored. */
  z.object({ resolution: z.literal("NONE") }).strict(),
]);
export type PatchTransactionInput = z.infer<typeof PatchTransactionBody>;

export const AccountParamsSchema = z.object({ address: StellarAddressSchema }).strict();
