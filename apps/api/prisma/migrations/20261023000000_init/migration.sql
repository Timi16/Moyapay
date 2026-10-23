-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentResult" AS ENUM ('MATCHED', 'UNMATCHED', 'WRONG_AMOUNT', 'WRONG_ASSET', 'ALREADY_PAID', 'LATE', 'FAILED_TX');

-- CreateEnum
CREATE TYPE "Resolution" AS ENUM ('NONE', 'ASSIGNED', 'REFUNDED', 'IGNORED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('CREATED', 'CHECKOUT_OPENED', 'PAYMENT_SEEN', 'PAID', 'FAILED', 'EXPIRED', 'DUPLICATE_IGNORED', 'FLAGGED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "webhookUrl" TEXT,
    "webhookEvents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "webhookSecretVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthChallenge" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "hits" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRequest" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "assetIssuer" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "amountStroops" BIGINT NOT NULL,
    "description" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "paidTxHash" TEXT,
    "paidAt" TIMESTAMP(3),
    "failedReason" TEXT,
    "createdVia" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomingPayment" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "opId" TEXT NOT NULL,
    "pagingToken" TEXT NOT NULL,
    "ledger" INTEGER NOT NULL,
    "createdAtLedger" TIMESTAMP(3) NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "assetIssuer" TEXT,
    "amount" TEXT NOT NULL,
    "amountStroops" BIGINT NOT NULL,
    "opType" TEXT NOT NULL,
    "memo" TEXT,
    "memoType" TEXT NOT NULL,
    "txSuccessful" BOOLEAN NOT NULL,
    "resultCodes" JSONB,
    "result" "PaymentResult" NOT NULL,
    "reason" TEXT NOT NULL,
    "requestId" TEXT,
    "resolution" "Resolution" NOT NULL DEFAULT 'NONE',
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatcherCursor" (
    "destination" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "pagingToken" TEXT,
    "lastLedger" INTEGER,
    "lastLedgerAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "watchFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatcherCursor_pkey" PRIMARY KEY ("destination")
);

-- CreateTable
CREATE TABLE "WatcherHeartbeat" (
    "id" TEXT NOT NULL,
    "beatAt" TIMESTAMP(3) NOT NULL,
    "latestLedger" INTEGER,
    "latestLedgerAt" TIMESTAMP(3),
    "streams" INTEGER NOT NULL DEFAULT 0,
    "connectedStreams" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WatcherHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastStatusCode" INTEGER,
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_walletAddress_key" ON "Merchant"("walletAddress");

-- CreateIndex
CREATE INDEX "AuthChallenge_createdAt_idx" ON "AuthChallenge"("createdAt");

-- CreateIndex
CREATE INDEX "Session_merchantId_idx" ON "Session"("merchantId");

-- CreateIndex
CREATE INDEX "RateLimit_resetAt_idx" ON "RateLimit"("resetAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_hash_key" ON "ApiKey"("hash");

-- CreateIndex
CREATE INDEX "ApiKey_merchantId_idx" ON "ApiKey"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRequest_reference_key" ON "PaymentRequest"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRequest_paidTxHash_key" ON "PaymentRequest"("paidTxHash");

-- CreateIndex
CREATE INDEX "PaymentRequest_merchantId_createdAt_idx" ON "PaymentRequest"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentRequest_merchantId_status_idx" ON "PaymentRequest"("merchantId", "status");

-- CreateIndex
CREATE INDEX "PaymentRequest_status_expiresAt_idx" ON "PaymentRequest"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "IncomingPayment_merchantId_createdAt_idx" ON "IncomingPayment"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "IncomingPayment_merchantId_result_idx" ON "IncomingPayment"("merchantId", "result");

-- CreateIndex
CREATE INDEX "IncomingPayment_requestId_idx" ON "IncomingPayment"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "IncomingPayment_txHash_opId_key" ON "IncomingPayment"("txHash", "opId");

-- CreateIndex
CREATE INDEX "RequestEvent_requestId_createdAt_idx" ON "RequestEvent"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "RequestEvent_type_createdAt_idx" ON "RequestEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "WatcherCursor_merchantId_idx" ON "WatcherCursor"("merchantId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx" ON "WebhookDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_merchantId_createdAt_idx" ON "WebhookDelivery"("merchantId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingPayment" ADD CONSTRAINT "IncomingPayment_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingPayment" ADD CONSTRAINT "IncomingPayment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PaymentRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PaymentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatcherCursor" ADD CONSTRAINT "WatcherCursor_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

