import { z } from "zod";
import { StellarAddressSchema, WEBHOOK_EVENTS } from "./common";

export const ChallengeBody = z.object({ address: StellarAddressSchema }).strict();

/** A wallet's signature in whatever shape it returns: base64/hex text or raw bytes. */
const SignatureSchema = z.union([
  z.string().min(1).max(256),
  z.array(z.number().int().min(0).max(255)).max(128),
  z.object({ type: z.literal("Buffer"), data: z.array(z.number().int().min(0).max(255)).max(128) }).strict(),
]);

/**
 * Proof of the wallet: either the SEP-53 signature of `message`, or the challenge
 * transaction signed by the wallet (for wallets that can only sign transactions).
 */
export const VerifyChallengeBody = z
  .object({
    challengeId: z.string().min(1).max(64),
    signature: SignatureSchema.optional(),
    signedTransaction: z.string().min(1).max(4096).optional(),
    /** Business name for a first sign-in. Ignored for an existing merchant. */
    name: z.string().trim().min(1).max(80).optional(),
  })
  .strict()
  .refine((b) => (b.signature === undefined) !== (b.signedTransaction === undefined), {
    message: "Send either signature or signedTransaction",
    path: ["signature"],
  });

export const UpdateMerchantBody = z.object({ name: z.string().trim().min(1).max(80) }).strict();

export const CreateApiKeyBody = z.object({ name: z.string().trim().min(1).max(60).default("Default") }).strict();

export const UpdateWebhookBody = z
  .object({
    /** https URL that receives status webhooks; null turns them off. */
    url: z.string().trim().url().max(2048).nullable(),
    events: z.array(z.enum(WEBHOOK_EVENTS)).max(WEBHOOK_EVENTS.length).default([...WEBHOOK_EVENTS]),
  })
  .strict();
