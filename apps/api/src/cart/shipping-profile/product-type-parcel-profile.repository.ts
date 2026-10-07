import { Injectable } from '@nestjs/common';
import { ProductTypeParcelProfile } from '../../generated/prisma';
import { PrismaService } from '../../prisma';
import { ProductTypeProfile } from './product-type-profile';

export interface ProductTypeProfileRow extends ProductTypeProfile {
  genericArticleId: number;
  productTypeName: string;
  computedAt: Date;
}

/** The shop-owned fallback table: what a part's product type typically weighs. */
@Injectable()
export class ProductTypeParcelProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByGenericArticleId(
    genericArticleId: number,
  ): Promise<ProductTypeProfile | null> {
    const row = await this.prisma.productTypeParcelProfile.findUnique({
      where: { genericArticleId },
    });

    return row === null ? null : toProfile(row);
  }

  /** The builder rebuilds the whole table, so a failed insert must keep the old one. */
  async replaceAll(rows: ProductTypeProfileRow[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.productTypeParcelProfile.deleteMany({}),
      this.prisma.productTypeParcelProfile.createMany({
        data: rows.map(toColumns),
      }),
    ]);
  }
}

function toProfile(row: ProductTypeParcelProfile): ProductTypeProfile {
  const { packageLengthCm, packageWidthCm, packageHeightCm } = row;
  const isBoxed =
    packageLengthCm !== null &&
    packageWidthCm !== null &&
    packageHeightCm !== null;

  return {
    weightGrams: row.weightGrams,
    packageCm: isBoxed
      ? {
          length: packageLengthCm,
          width: packageWidthCm,
          height: packageHeightCm,
        }
      : null,
    sampleSize: row.sampleSize,
  };
}

function toColumns(row: ProductTypeProfileRow): ProductTypeParcelProfile {
  return {
    genericArticleId: row.genericArticleId,
    productTypeName: row.productTypeName,
    weightGrams: row.weightGrams,
    packageLengthCm: row.packageCm?.length ?? null,
    packageWidthCm: row.packageCm?.width ?? null,
    packageHeightCm: row.packageCm?.height ?? null,
    sampleSize: row.sampleSize,
    computedAt: row.computedAt,
  };
}
