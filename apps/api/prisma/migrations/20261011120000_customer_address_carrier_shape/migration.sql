-- AlterTable
ALTER TABLE "Address" DROP COLUMN "fullName",
DROP COLUMN "phoneNumber",
DROP COLUMN "postcode",
ADD COLUMN     "block" TEXT,
ADD COLUMN     "carrier" "ShippingMethod" NOT NULL,
ADD COLUMN     "entrance" TEXT,
ADD COLUMN     "floor" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "placeId" TEXT NOT NULL,
ADD COLUMN     "postCode" TEXT NOT NULL,
ADD COLUMN     "quarter" TEXT,
ALTER COLUMN "street" DROP NOT NULL,
ALTER COLUMN "streetNumber" DROP NOT NULL;

