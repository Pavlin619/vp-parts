import { Injectable } from '@nestjs/common';
import { ArticleIdentityDto, articleIdentityKey } from '@vp-parts-shop/shared';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma';
import { toCents, toInteger } from './db-value';

/**
 * One of our own stock lines for a part, projected to the columns the shop is
 * allowed to read. Monetary values are integer EUR cents (converted from the
 * backoffice's decimal currency columns at this boundary). Both the net and
 * gross sell prices come straight from the row — no VAT is recomputed.
 */
export interface OwnStockRow {
  tecdocNumber: string;
  /** TecDoc `dataSupplierId` the backoffice attributed the line to. */
  brandId: string;
  availableQuantity: number;
  sellPriceExVatCents: number;
  sellPriceIncVatCents: number;
}

/**
 * `tecdoc_supplier_id` is nullable in the table but never null here: every query
 * below equates it to a brand id, and NULL equals nothing.
 */
interface RawAutopartRow {
  tecdoc_number: string;
  tecdoc_supplier_id: string;
  available_quantity: number | string | bigint | null;
  sell_price_net: number | string | Prisma.Decimal | null;
  gross_price: number | string | Prisma.Decimal | null;
}

/**
 * Read-only access to the backoffice-owned `public.autoparts` table — our own
 * stock. Checked first: when we carry a part the displayed price is locked to
 * our sell price. The shop role has column-scoped SELECT only; never writes.
 *
 * Rows are matched on the whole article identity — number *and* brand — which
 * is what `idx_autoparts_tecdoc` is keyed on. A number alone is not an identity:
 * two data suppliers can file the same one, and quoting a customer the other
 * supplier's price is a wrong price on a part they then buy.
 */
@Injectable()
export class AutopartsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByArticle({
    brandId,
    articleNumber,
  }: ArticleIdentityDto): Promise<OwnStockRow[]> {
    const rows = await this.prisma.$queryRaw<RawAutopartRow[]>(Prisma.sql`
      SELECT tecdoc_number, tecdoc_supplier_id, available_quantity, sell_price_net, gross_price
      FROM public.autoparts
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
  ): Promise<Map<string, OwnStockRow[]>> {
    if (articles.length === 0) {
      return new Map();
    }

    const articleNumbers = articles.map((article) => article.articleNumber);
    const brandIds = articles.map((article) => article.brandId);

    const rows = await this.prisma.$queryRaw<RawAutopartRow[]>(Prisma.sql`
      SELECT autopart.tecdoc_number, autopart.tecdoc_supplier_id,
             autopart.available_quantity, autopart.sell_price_net, autopart.gross_price
      FROM public.autoparts AS autopart
      JOIN unnest(${articleNumbers}::text[], ${brandIds}::text[])
        AS wanted(tecdoc_number, tecdoc_supplier_id)
        ON autopart.tecdoc_number = wanted.tecdoc_number
       AND autopart.tecdoc_supplier_id = wanted.tecdoc_supplier_id
    `);

    const grouped = new Map<string, OwnStockRow[]>();
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

function mapRow(raw: RawAutopartRow): OwnStockRow {
  return {
    tecdocNumber: raw.tecdoc_number,
    brandId: raw.tecdoc_supplier_id,
    availableQuantity: toInteger(raw.available_quantity),
    sellPriceExVatCents: toCents(raw.sell_price_net),
    sellPriceIncVatCents: toCents(raw.gross_price),
  };
}
