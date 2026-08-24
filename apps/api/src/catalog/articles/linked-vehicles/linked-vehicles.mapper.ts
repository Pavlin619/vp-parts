/**
 * The wire contracts of the three TecDoc calls behind the applicable-vehicles
 * section, and the parsing that turns each into something the feature can use.
 *
 * Each envelope is declared beside the function that reads it, since one is the
 * input contract of the other and neither has a reader anywhere else. They live
 * in the feature for the same reason: `LinkedVehiclesTecDoc` is the only caller
 * that speaks these shapes, while `tecdoc/` holds what several features share.
 */
import { LinkedVehicleManufacturerDto } from '@vp-parts-shop/shared';
import { LinkedVehicleWithSeries } from '../../../tecdoc';

/**
 * The `getArticleLinkedAllLinkingTargetManufacturer2` response envelope — the
 * makes one article is linked to, per Onboarding Guide §8.4 step 1.
 *
 * Names and ids only: the function files no count, which is why the makes level
 * of the applicable-vehicles section shows none.
 */
export interface TecDocLinkedManufacturerResponse {
  data?: {
    array?: Array<{ manuId?: number; manuName?: string }>;
  };
}

/**
 * The makes read out of the response envelope. A record missing either half is
 * dropped rather than rendered as a nameless row that resolves to nothing.
 */
export function collectLinkedManufacturers(
  response: TecDocLinkedManufacturerResponse,
): LinkedVehicleManufacturerDto[] {
  return (response.data?.array ?? [])
    .filter(
      (record): record is { manuId: number; manuName: string } =>
        record.manuId !== undefined && Boolean(record.manuName),
    )
    .map((record) => ({
      manufacturerId: String(record.manuId),
      name: record.manuName,
    }));
}

/**
 * The `getArticleLinkedAllLinkingTarget4` response envelope (§8.4 step 2).
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
 * A `getVehicleByIds4` record — the call that turns linkage target ids into
 * displayable vehicles. `carId` is the linkage target id under the name this
 * function uses for it.
 *
 * Every field under `vehicleDetails` is optional because TecDoc omits what it
 * has not catalogued rather than sending a null, and dereferencing a missing
 * key directly turns an ordinary sparse row into a 500. `motorCodes` arrives
 * only when the request asks for it.
 *
 * It nests its rows under `array` rather than being one: the XSD types it
 * `motorCodesByCarIdRecordSeq`, and every `…Seq` is a wrapper holding a
 * repeated `array` element — the same shape as `data.array` above, and as the
 * `carIds` the request sends. `getArticles` and `getLinkageTargets` return bare
 * arrays instead, so the convention is per function, not per service.
 */
export interface TecDocVehicleRecord {
  carId: number;
  motorCodes?: { array?: Array<{ motorCode?: string }> };
  vehicleDetails?: {
    manuId?: number;
    manuName?: string;
    modId?: number;
    modelName?: string;
    typeName?: string;
    fuelType?: string;
    powerKwFrom?: number;
    powerHpFrom?: number;
    yearOfConstrFrom?: number;
    yearOfConstrTo?: number;
  };
}

export interface TecDocVehiclesResponse {
  data?: { array?: TecDocVehicleRecord[] };
}

export function collectLinkedVehicles(
  response: TecDocVehiclesResponse,
): TecDocVehicleRecord[] {
  return response.data?.array ?? [];
}

export function mapLinkedVehicle(
  record: TecDocVehicleRecord,
): LinkedVehicleWithSeries {
  const details = record.vehicleDetails ?? {};

  return {
    seriesId: String(details.modId ?? ''),
    seriesName: details.modelName ?? '',
    manufacturerId: String(details.manuId ?? ''),
    vehicle: {
      vehicleId: String(record.carId),
      name: details.typeName ?? '',
      yearFrom: parseYear(details.yearOfConstrFrom),
      yearTo: parseYear(details.yearOfConstrTo),
      powerKw: details.powerKwFrom ?? null,
      powerHp: details.powerHpFrom ?? null,
      fuelType: details.fuelType ?? null,
      engineCodes: (record.motorCodes?.array ?? [])
        .map((entry) => entry.motorCode)
        .filter((code): code is string => Boolean(code)),
    },
  };
}

/**
 * TecDoc files these years as `YYYYMM` integers (`201004`), unlike the
 * `YYYY-MM` strings `getLinkageTargets` returns. Anything shorter than a year
 * is treated as unknown rather than coerced to a nonsense number.
 */
function parseYear(yearMonth: number | null | undefined): number | null {
  if (yearMonth === null || yearMonth === undefined) {
    return null;
  }

  const digits = String(yearMonth);

  if (digits.length < 4) {
    return null;
  }

  const year = Number.parseInt(digits.slice(0, 4), 10);

  return Number.isNaN(year) ? null : year;
}
