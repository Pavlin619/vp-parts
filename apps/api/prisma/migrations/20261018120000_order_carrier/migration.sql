-- AlterTable
ALTER TABLE "Order" RENAME COLUMN "shippingMethod" TO "carrier";
ALTER TABLE "Order" DROP COLUMN "courierName";
