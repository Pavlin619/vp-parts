-- AlterTable
ALTER TABLE "CardPayment" ADD COLUMN     "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- DropIndex
DROP INDEX "CardPayment_status_expiresAt_idx";

-- CreateIndex
CREATE INDEX "CardPayment_status_nextCheckAt_idx" ON "CardPayment"("status", "nextCheckAt");
