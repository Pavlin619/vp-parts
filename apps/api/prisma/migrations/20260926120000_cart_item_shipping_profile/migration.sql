-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "packageHeightCm" DOUBLE PRECISION,
ADD COLUMN     "packageLengthCm" DOUBLE PRECISION,
ADD COLUMN     "packageWidthCm" DOUBLE PRECISION,
ADD COLUMN     "weightGrams" INTEGER;
