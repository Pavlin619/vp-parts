import { Injectable } from '@nestjs/common';
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
  availableQuantity: number;
  sellPriceExVatCents: number;
  sellPriceIncVatCents: number;
}

interface RawAutopartRow {
  tecdoc_number: string;
  available_quantity: number | string | bigint | null;
  sell_price_net: number | string | Prisma.Decimal | null;
  gross_price: number | string | Prisma.Decimal | null;
}

/**
 * Read-only access to the backoffice-owned `public.autoparts` table — our own
 * stock. Checked first: when we carry a part the displayed price is locked to
 * our sell price. The shop role has column-scoped SELECT only; never writes.
 *
 * TODO(inventory-keying): confirm `tecdoc_number` alone identifies a part, i.e.
 * that the WHERE clauses below are narrow enough. TecDoc keys an article by
 * brand *and* article number, so two data suppliers shipping the same number
 * would both match here and one brand's part could be priced from another's
 * stock. The per-number row array hides it, because it cannot distinguish
 * "several stock lines for this part" from "two brands collided". Check how the
 * backoffice fills the table; if the number is not unique across brands, these
 * lookups need the brand too.
 */
@Injectable()
export class AutopartsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByTecdocNumber(tecdocNumber: string): Promise<OwnStockRow[]> {
    const rows = await this.prisma.$queryRaw<RawAutopartRow[]>(Prisma.sql`
      SELECT tecdoc_number, available_quantity, sell_price_net, gross_price
      FROM public.autoparts
      WHERE tecdoc_number = ${tecdocNumber}
    `);

    return rows.map(mapRow);
  }

  async findByTecdocNumbers(
    tecdocNumbers: string[],
  ): Promise<Map<string, OwnStockRow[]>> {
    if (tecdocNumbers.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.$queryRaw<RawAutopartRow[]>(Prisma.sql`
      SELECT tecdoc_number, available_quantity, sell_price_net, gross_price
      FROM public.autoparts
      WHERE tecdoc_number IN (${Prisma.join(tecdocNumbers)})
    `);

    const grouped = new Map<string, OwnStockRow[]>();
    for (const raw of rows) {
      const row = mapRow(raw);
      const existing = grouped.get(row.tecdocNumber);
      if (existing) {
        existing.push(row);
      } else {
        grouped.set(row.tecdocNumber, [row]);
      }
    }

    return grouped;
  }
}

function mapRow(raw: RawAutopartRow): OwnStockRow {
  return {
    tecdocNumber: raw.tecdoc_number,
    availableQuantity: toInteger(raw.available_quantity),
    sellPriceExVatCents: toCents(raw.sell_price_net),
    sellPriceIncVatCents: toCents(raw.gross_price),
  };
}
