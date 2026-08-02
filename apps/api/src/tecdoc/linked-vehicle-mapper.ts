import { LinkedVehicleDto } from '@vp-parts-shop/shared';

/**
 * The `getArticleLinkedAllLinkingTarget4` response envelope.
 *
 * The linkage read answers with ids and nothing else — no make, no series, no
 * production years — so the vehicles themselves have to be fetched separately
 * by those ids. Note the singular `linking`: this function predates the
 * `linkageTarget*` naming the rest of the catalog uses.
 */
export interface TecDocArticleLinkagesResponse {
  data?: {
    array?: Array<{
      articleLinkages?: {
        array?: Array<{ linked?: boolean; linkingTargetId?: number }>;
      };
    }>;
  };
}

/**
 * The linkage target ids an article is confirmed to fit, read out of the
 * doubly-nested response envelope. `linked: false` is TecDoc stating the
 * article does *not* fit that target, so those rows are dropped rather than
 * listed as compatible.
 */
export function collectLinkedTargetIds(
  response: TecDocArticleLinkagesResponse,
): number[] {
  const linkages = (response.data?.array ?? []).flatMap(
    (record) => record.articleLinkages?.array ?? [],
  );

  return linkages
    .filter((linkage) => linkage.linked !== false)
    .map((linkage) => linkage.linkingTargetId)
    .filter((targetId): targetId is number => targetId !== undefined);
}

/**
 * A `getLinkageTargets` record — the call that turns the ids above into
 * displayable vehicles.
 *
 * Every field is optional because TecDoc omits what it has not catalogued
 * rather than sending a null — a modification with no engine code on file
 * arrives without the key, and dereferencing it directly turns an ordinary
 * sparse row into a 500.
 */
export interface TecDocLinkageTargetRecord {
  linkageTargetId: number;
  mfrName?: string;
  vehicleModelSeriesName?: string;
  description?: string;
  beginYearMonth?: string;
  endYearMonth?: string | null;
  kiloWattsFrom?: number;
  horsePowerFrom?: number;
  fuelType?: string;
  engines?: Array<{ code?: string }>;
}

/**
 * Maps a linkage target into the flat applicable-vehicle row the catalog
 * renders. The make and series ride on every row because the grouping into
 * make → series → modification is the client's choice, not the contract's.
 */
export function mapLinkedVehicle(
  target: TecDocLinkageTargetRecord,
): LinkedVehicleDto {
  return {
    vehicleId: String(target.linkageTargetId),
    manufacturerName: target.mfrName ?? '',
    modelSeriesName: target.vehicleModelSeriesName ?? '',
    name: target.description ?? '',
    yearFrom: parseYear(target.beginYearMonth),
    yearTo: parseYear(target.endYearMonth),
    powerKw: target.kiloWattsFrom ?? null,
    powerHp: target.horsePowerFrom ?? null,
    fuelType: target.fuelType ?? null,
    engineCode: target.engines?.[0]?.code ?? null,
  };
}

/**
 * TecDoc dates are `YYYY-MM`, and an open-ended production run has no end at
 * all. Anything else is treated as unknown rather than coerced to NaN.
 */
function parseYear(yearMonth: string | null | undefined): number | null {
  if (!yearMonth) {
    return null;
  }

  const year = Number.parseInt(yearMonth.split('-')[0], 10);

  return Number.isNaN(year) ? null : year;
}
