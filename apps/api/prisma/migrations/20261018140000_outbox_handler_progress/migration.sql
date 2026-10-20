-- A delivered event is now deleted rather than marked, so one marked earlier has nothing left to do.
DELETE FROM "OutboxEvent" WHERE "processedAt" IS NOT NULL;

-- DropIndex
DROP INDEX "OutboxEvent_processedAt_availableAt_idx";

-- AlterTable
ALTER TABLE "OutboxEvent" DROP COLUMN "processedAt",
ADD COLUMN     "completedHandlers" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "OutboxEvent_availableAt_idx" ON "OutboxEvent"("availableAt");
