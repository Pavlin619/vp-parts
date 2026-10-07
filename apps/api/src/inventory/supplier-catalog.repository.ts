import { Injectable } from '@nestjs/common';
import { ArticleIdentityDto } from '@vp-parts-shop/shared';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma';
import type { ShippingProfile } from '../tecdoc';

type RawDecimal = string | number | Prisma.Decimal | null;

interface RawPackageRow {
  package_weight_kg: RawDecimal;
  package_length_cm: RawDecimal;
  package_width_cm: RawDecimal;
  package_height_cm: RawDecimal;
}

const UNKNOWN_PROFILE: ShippingProfile = { weightGrams: null, packageCm: null };

/** The row carrying the most measurements first, so a weight and its box come from one record. */
const BEST_MEASURED_FIRST = Prisma.sql`
  (package_weight_kg IS NOT NULL) DESC,
  (package_length_cm IS NOT NULL
   AND package_width_cm IS NOT NULL
   AND package_height_cm IS NOT NULL) DESC,
  supplier_source
`;

/**
 * Read-only access to the backoffice-owned `public.supplier_product_catalog`,
 * for the packed weight and box size suppliers publish. The shop role has
 * column-scoped SELECT only; this repository never writes.
 *
 * Matched on number *and* brand, which is what `idx_spc_tecdoc` is keyed on:
 * the table holds ~6 million rows and a number alone is not an identity.
 */
@Injectable()
export class SupplierCatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** One part can be filed by several suppliers; see {@link BEST_MEASURED_FIRST}. */
  async findPackageProfile({
    brandId,
    articleNumber,
  }: ArticleIdentityDto): Promise<ShippingProfile> {
    const rows = await this.prisma.$queryRaw<RawPackageRow[]>(Prisma.sql`
      SELECT package_weight_kg, package_length_cm, package_width_cm, package_height_cm
      FROM public.supplier_product_catalog
      WHERE tecdoc_number = ${articleNumber}
        AND tecdoc_supplier_id = ${brandId}
      ORDER BY ${BEST_MEASURED_FIRST}
      LIMIT 1
    `);

    return rows.length === 0 ? UNKNOWN_PROFILE : toShippingProfile(rows[0]);
  }

  /** {@link findPackageProfile} for many parts in one query. Parts the catalogue lacks are absent. */
  async findPackageProfiles(
    identities: ArticleIdentityDto[],
  ): Promise<ShippingProfile[]> {
    if (identities.length === 0) {
      return [];
    }

    const articleNumbers = identities.map((identity) => identity.articleNumber);
    const brandIds = identities.map((identity) => identity.brandId);
    const rows = await this.prisma.$queryRaw<RawPackageRow[]>(Prisma.sql`
      SELECT DISTINCT ON (wanted.article_number, wanted.brand_id)
             package_weight_kg, package_length_cm, package_width_cm, package_height_cm
      FROM unnest(${articleNumbers}::text[], ${brandIds}::text[])
             AS wanted(article_number, brand_id)
      JOIN public.supplier_product_catalog c
        ON c.tecdoc_number = wanted.article_number
       AND c.tecdoc_supplier_id = wanted.brand_id
      ORDER BY wanted.article_number, wanted.brand_id, ${BEST_MEASURED_FIRST}
    `);

    return rows.map(toShippingProfile);
  }
}

function toShippingProfile(raw: RawPackageRow): ShippingProfile {
  const weightKg = toPositiveNumber(raw.package_weight_kg);
  const length = toPositiveNumber(raw.package_length_cm);
  const width = toPositiveNumber(raw.package_width_cm);
  const height = toPositiveNumber(raw.package_height_cm);
  const isBoxed = length !== null && width !== null && height !== null;

  return {
    // decimal(10,3) kilograms are whole grams, so rounding only undoes float noise.
    weightGrams: weightKg === null ? null : Math.round(weightKg * 1000),
    packageCm: isBoxed ? { length, width, height } : null,
  };
}

function toPositiveNumber(value: RawDecimal): number | null {
  if (value == null) return null;
  const numeric = Number(value);

  return numeric > 0 ? numeric : null;
}
