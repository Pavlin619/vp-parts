-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('ACTIVE', 'MERGED', 'ORDERED');

-- DropForeignKey
ALTER TABLE "Cart" DROP CONSTRAINT "Cart_customerId_fkey";

-- DropIndex
DROP INDEX "Cart_customerId_idx";

-- DropIndex
DROP INDEX "CartItem_cartId_articleNumber_key";

-- AlterTable
ALTER TABLE "Cart" DROP COLUMN "name",
ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "mergedIntoId" TEXT,
ADD COLUMN     "orderId" TEXT,
ADD COLUMN     "status" "CartStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "token" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "customerId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CartItem" DROP COLUMN "unitPriceCaptured",
ADD COLUMN     "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "addedAtPriceIncVat" INTEGER,
ADD COLUMN     "brandId" TEXT NOT NULL,
ADD COLUMN     "brandLogoUrl" TEXT,
ADD COLUMN     "isSelected" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "thumbnailUrl" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cartId" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "brandId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Cart_token_key" ON "Cart"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_orderId_key" ON "Cart"("orderId");

-- CreateIndex
CREATE INDEX "Cart_customerId_status_idx" ON "Cart"("customerId", "status");

-- CreateIndex
CREATE INDEX "Cart_expiresAt_idx" ON "Cart"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_brandId_articleNumber_key" ON "CartItem"("cartId", "brandId", "articleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Order_cartId_key" ON "Order"("cartId");

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A customer has at most one cart they are filling. Partial, because the same
-- customer keeps every cart they have merged away or ordered from, and those
-- must not collide with the live one. Prisma cannot express a WHERE on an
-- index, so this is written out by hand.
CREATE UNIQUE INDEX "Cart_one_active_per_customer"
    ON "Cart" ("customerId")
    WHERE "status" = 'ACTIVE' AND "customerId" IS NOT NULL;
