-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('COURIER_OFFICE', 'COURIER_ADDRESS', 'STORE_PICKUP');

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "shippingCost",
DROP COLUMN "subtotal",
ADD COLUMN     "cashOnDeliveryFee" INTEGER NOT NULL,
ADD COLUMN     "contactEmail" TEXT NOT NULL,
ADD COLUMN     "contactFirstName" TEXT NOT NULL,
ADD COLUMN     "contactLastName" TEXT NOT NULL,
ADD COLUMN     "contactPhone" TEXT NOT NULL,
ADD COLUMN     "deliveryMethod" "DeliveryMethod" NOT NULL,
ADD COLUMN     "deliveryPrice" INTEGER NOT NULL,
ADD COLUMN     "expectedDeliveryDate" DATE,
ADD COLUMN     "goodsTotal" INTEGER NOT NULL,
ADD COLUMN     "parcelWeightGrams" INTEGER,
ADD COLUMN     "termsVersion" TEXT NOT NULL,
ALTER COLUMN "shippingMethod" DROP NOT NULL;


-- Numbers order references (VP-000123); see docs/ORDERS.md.
CREATE SEQUENCE "order_reference_seq";
