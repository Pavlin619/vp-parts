import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../../prisma';

export interface StockedBrand {
  brandId: number;
  /** How many of the brand's parts the supplier catalogue gives a weight. */
  weighedCount: number;
}

interface RawStockedBrand {
  brand_id: string;
  weighed_count: bigint | number;
}

/** Read-only: which TecDoc brands we have stock of, and how well the catalogue weighs them. */
@Injectable()
export class StockedBrandsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findStockedBrands(): Promise<StockedBrand[]> {
    const rows = await this.prisma.$queryRaw<RawStockedBrand[]>(Prisma.sql`
      WITH stocked AS (
        SELECT tecdoc_supplier_id FROM public.supplier_stock
        WHERE availability > 0 AND tecdoc_supplier_id ~ '^[0-9]+$'
        UNION
        SELECT tecdoc_supplier_id FROM public.autoparts
        WHERE available_quantity > 0 AND tecdoc_supplier_id ~ '^[0-9]+$'
      ),
      weighed AS (
        SELECT tecdoc_supplier_id, count(*) AS weighed_count
        FROM public.supplier_product_catalog
        WHERE package_weight_kg > 0
        GROUP BY tecdoc_supplier_id
      )
      SELECT stocked.tecdoc_supplier_id AS brand_id,
             COALESCE(weighed.weighed_count, 0) AS weighed_count
      FROM stocked
      LEFT JOIN weighed USING (tecdoc_supplier_id)
    `);

    return rows.map((row) => ({
      brandId: Number(row.brand_id),
      weighedCount: Number(row.weighed_count),
    }));
  }
}
