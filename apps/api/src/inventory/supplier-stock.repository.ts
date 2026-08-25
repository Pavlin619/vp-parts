import { Injectable } from '@nestjs/common';
import { ArticleIdentityDto, articleIdentityKey } from '@vp-parts-shop/shared';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma';
import { toCents, toIntegerOrNull } from './db-value';

/**
 * One supplier's stock line for a part, projected to the columns the shop is
 * allowed to read. Monetary values are integer EUR cents (converted from the
 * backoffice's decimal currency columns at this boundary).
 *
 * `availability` is `null` when the source row carried no usable quantity (a
 * data anomaly): the inventory layer treats that as "unknown" and excludes the
 * offer rather than guessing a count.
 */
export interface SupplierStockRow {
  supplierSource: string;
  warehouseCode: string | null;
  availability: number | null;
  buyPriceCents: number;
  sellPriceCents: number;
  tecdocNumber: string;
  /** TecDoc `dataSupplierId` the backoffice attributed the line to. */
  brandId: string;
}

/**
 * `tecdoc_supplier_id` is nullable in the table but never null here: every query
 * below equates it to a brand id, and NULL equals nothing.
 */
interface RawSupplierStockRow {
  supplier_source: string;
  warehouse_code: string | null;
  availability: number | string | bigint | null;
  buy_price: number | string | Prisma.Decimal | null;
  sell_price: number | string | Prisma.Decimal | null;
  tecdoc_number: string;
  tecdoc_supplier_id: string;
}

/**
 * Read-only access to the backoffice-owned `public.supplier_stock` projection.
 * The shop role has column-scoped SELECT only; this repository never writes.
 *
 * Rows are matched on the whole article identity — number *and* brand — which
 * is what `idx_supplier_stock_tecdoc` is keyed on. A number alone is not an
 * identity: 13,596 numbers here are filed by more than one supplier, so a
 * number-only match prices one brand's part from another brand's shelf.
 */
@Injectable()
export class SupplierStockRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByArticle({
    brandId,
    articleNumber,
  }: ArticleIdentityDto): Promise<SupplierStockRow[]> {
    const rows = await this.prisma.$queryRaw<RawSupplierStockRow[]>(Prisma.sql`
      SELECT supplier_source, warehouse_code, availability, buy_price, sell_price,
             tecdoc_number, tecdoc_supplier_id
      FROM public.supplier_stock
      WHERE tecdoc_number = ${articleNumber}
        AND tecdoc_supplier_id = ${brandId}
    `);

    return rows.map(mapRow);
  }

  /**
   * The batch read, keyed by {@link articleIdentityKey}. The wanted pairs are
   * joined in as two parallel arrays rather than expanded into an OR list, so
   * one prepared statement serves any batch size and each pair is an index
   * lookup on both columns.
   */
  async findByArticles(
    articles: ArticleIdentityDto[],
  ): Promise<Map<string, SupplierStockRow[]>> {
    if (articles.length === 0) {
      return new Map();
    }

    const articleNumbers = articles.map((article) => article.articleNumber);
    const brandIds = articles.map((article) => article.brandId);

    const rows = await this.prisma.$queryRaw<RawSupplierStockRow[]>(Prisma.sql`
      SELECT stock.supplier_source, stock.warehouse_code, stock.availability,
             stock.buy_price, stock.sell_price,
             stock.tecdoc_number, stock.tecdoc_supplier_id
      FROM public.supplier_stock AS stock
      JOIN unnest(${articleNumbers}::text[], ${brandIds}::text[])
        AS wanted(tecdoc_number, tecdoc_supplier_id)
        ON stock.tecdoc_number = wanted.tecdoc_number
       AND stock.tecdoc_supplier_id = wanted.tecdoc_supplier_id
    `);

    const grouped = new Map<string, SupplierStockRow[]>();
    for (const raw of rows) {
      const key = articleIdentityKey(raw.tecdoc_supplier_id, raw.tecdoc_number);
      const existing = grouped.get(key);
      if (existing) {
        existing.push(mapRow(raw));
      } else {
        grouped.set(key, [mapRow(raw)]);
      }
    }

    return grouped;
  }
}

function mapRow(raw: RawSupplierStockRow): SupplierStockRow {
  return {
    supplierSource: raw.supplier_source,
    warehouseCode: raw.warehouse_code,
    availability: toIntegerOrNull(raw.availability),
    buyPriceCents: toCents(raw.buy_price),
    sellPriceCents: toCents(raw.sell_price),
    tecdocNumber: raw.tecdoc_number,
    brandId: raw.tecdoc_supplier_id,
  };
}
