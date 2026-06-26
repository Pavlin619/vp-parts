import { Injectable } from '@nestjs/common';
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
}

interface RawSupplierStockRow {
  supplier_source: string;
  warehouse_code: string | null;
  availability: number | string | bigint | null;
  buy_price: number | string | Prisma.Decimal | null;
  sell_price: number | string | Prisma.Decimal | null;
  tecdoc_number: string;
}

/**
 * Read-only access to the backoffice-owned `public.supplier_stock` projection.
 * The shop role has column-scoped SELECT only; this repository never writes.
 */
@Injectable()
export class SupplierStockRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByTecdocNumber(tecdocNumber: string): Promise<SupplierStockRow[]> {
    const rows = await this.prisma.$queryRaw<RawSupplierStockRow[]>(Prisma.sql`
      SELECT supplier_source, warehouse_code, availability, buy_price, sell_price, tecdoc_number
      FROM public.supplier_stock
      WHERE tecdoc_number = ${tecdocNumber}
    `);

    return rows.map(mapRow);
  }

  async findByTecdocNumbers(
    tecdocNumbers: string[],
  ): Promise<Map<string, SupplierStockRow[]>> {
    if (tecdocNumbers.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.$queryRaw<RawSupplierStockRow[]>(Prisma.sql`
      SELECT supplier_source, warehouse_code, availability, buy_price, sell_price, tecdoc_number
      FROM public.supplier_stock
      WHERE tecdoc_number IN (${Prisma.join(tecdocNumbers)})
    `);

    const grouped = new Map<string, SupplierStockRow[]>();
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

function mapRow(raw: RawSupplierStockRow): SupplierStockRow {
  return {
    supplierSource: raw.supplier_source,
    warehouseCode: raw.warehouse_code,
    availability: toIntegerOrNull(raw.availability),
    buyPriceCents: toCents(raw.buy_price),
    sellPriceCents: toCents(raw.sell_price),
    tecdocNumber: raw.tecdoc_number,
  };
}
