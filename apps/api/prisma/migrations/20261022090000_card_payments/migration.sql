-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'PENDING_PAYMENT' BEFORE 'AWAITING_CONFIRMATION';

-- CreateEnum
CREATE TYPE "CardPaymentStatus" AS ENUM ('OPEN', 'SUCCEEDED', 'FAILED', 'ABANDONED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CardPayment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "transactionId" TEXT NOT NULL,
    "status" "CardPaymentStatus" NOT NULL DEFAULT 'OPEN',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CardPayment_transactionId_key" ON "CardPayment"("transactionId");

-- CreateIndex
CREATE INDEX "CardPayment_status_expiresAt_idx" ON "CardPayment"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CardPayment_orderId_attempt_key" ON "CardPayment"("orderId", "attempt");

-- AddForeignKey
ALTER TABLE "CardPayment" ADD CONSTRAINT "CardPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
