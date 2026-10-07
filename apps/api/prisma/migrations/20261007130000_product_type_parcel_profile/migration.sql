-- CreateTable
CREATE TABLE "ProductTypeParcelProfile" (
    "genericArticleId" INTEGER NOT NULL,
    "productTypeName" TEXT NOT NULL,
    "weightGrams" INTEGER NOT NULL,
    "packageLengthCm" DOUBLE PRECISION,
    "packageWidthCm" DOUBLE PRECISION,
    "packageHeightCm" DOUBLE PRECISION,
    "sampleSize" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductTypeParcelProfile_pkey" PRIMARY KEY ("genericArticleId")
);
