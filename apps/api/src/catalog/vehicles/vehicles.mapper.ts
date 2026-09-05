/**
 * The wire contracts of the vehicle-selection reads, and the parsing that turns
 * each into what the feature serves.
 *
 * Each envelope is declared beside the function that reads it, since one is the
 * input contract of the other and neither has a reader anywhere else. They live
 * in the feature for the same reason: `VehiclesTecDoc` is the only caller that
 * speaks these shapes, while `tecdoc/` holds what several features share.
 *
 * Every collection below is typed optional because TecDoc omits a collection
 * rather than sending an empty one — a filter that matches nothing (an unknown
 * manufacturer, a vehicle with no catalogued parts) still returns `status: 200`,
 * just without the key. Dereferencing it directly turns an ordinary empty result
 * into a 500.
 */
import {
  AssemblyGroupDto,
  ModelSeriesDto,
  VehicleVariantDto,
} from '@vp-parts-shop/shared';

/**
 * One make in the `getLinkageTargets` manufacturer facet.
 *
 * The count is kept because it is what ranks the popular half of the make list
 * — see `orderManufacturers` — and is dropped on the way to `ManufacturerDto`,
 * which no surface renders a vehicle count on.
 */
export interface ManufacturerFacetEntry {
  id: number;
  name: string;
  vehicleCount: number;
}

export interface TecDocManufacturerFacetResponse {
  mfrFacets?: {
    counts?: Array<{ id: number; name: string; count: number }>;
  };
}

export function collectManufacturerFacet(
  response: TecDocManufacturerFacetResponse,
): ManufacturerFacetEntry[] {
  return (response.mfrFacets?.counts ?? []).map((entry) => ({
    id: entry.id,
    name: entry.name,
    vehicleCount: entry.count,
  }));
}

/**
 * The `getManufacturers2` response envelope. A legacy function, hence the
 * `data.array` wrapper the newer facet calls do not use.
 */
export interface TecDocFavouredManufacturersResponse {
  data?: { array?: Array<{ manuId: number }> };
}

/**
 * A set rather than a list, because membership is all the ids are for: they
 * decide which facet entries carry `isPopular` and nothing else — the names and
 * counts come from the facet.
 */
export function collectFavouredManufacturerIds(
  response: TecDocFavouredManufacturersResponse,
): Set<number> {
  return new Set(
    (response.data?.array ?? []).map((make) => Number(make.manuId)),
  );
}

export interface TecDocModelSeriesFacetResponse {
  vehicleModelSeriesFacets?: {
    counts?: Array<{ id: number; name: string }>;
  };
}

/**
 * The make is carried in from the request: the facet answers a call already
 * narrowed to one manufacturer, so it does not repeat it on each row.
 */
export function mapModelSeries(
  response: TecDocModelSeriesFacetResponse,
  manufacturerId: number,
): ModelSeriesDto[] {
  return (response.vehicleModelSeriesFacets?.counts ?? []).map((entry) => ({
    id: String(entry.id),
    manufacturerId: String(manufacturerId),
    name: entry.name,
  }));
}

export interface TecDocVehicleVariantRecord {
  linkageTargetId: number;
  vehicleModelSeriesId: number;
  description: string;
  beginYearMonth: string;
  endYearMonth: string | null;
  engines: Array<{ code: string }>;
  kiloWattsFrom: number;
  horsePowerFrom?: number;
  capacityLiters?: number;
  vehicleImages?: Array<{ imageURL800: string }>;
  fuelType: string;
  bodyStyle: string;
}

export interface TecDocVehicleVariantsResponse {
  linkageTargets?: TecDocVehicleVariantRecord[];
}

export function mapVehicleVariants(
  response: TecDocVehicleVariantsResponse,
): VehicleVariantDto[] {
  return (response.linkageTargets ?? []).map(mapVehicleVariant);
}

function mapVehicleVariant(
  record: TecDocVehicleVariantRecord,
): VehicleVariantDto {
  return {
    vehicleId: String(record.linkageTargetId),
    seriesId: String(record.vehicleModelSeriesId),
    name: record.description,
    yearFrom: yearOf(record.beginYearMonth),
    yearTo: record.endYearMonth ? yearOf(record.endYearMonth) : null,
    engine: record.engines[0]?.code ?? '',
    powerKw: record.kiloWattsFrom,
    // Optional in the XSD, though present on all 1,268 variants measured —
    // absence is the schema's allowance rather than a case in the data.
    powerHp: record.horsePowerFrom ?? null,
    // TecDoc's own litres, not `capacityCC` divided down: it files 2,143 cc
    // as 2.2 l to match the badge on the car, where dividing reads 2.1.
    // Absent on an electric variant, which has no displacement at all.
    displacementLiters: record.capacityLiters ?? null,
    fuelType: record.fuelType,
    bodyType: record.bodyStyle,
    // No include flag turns these on — `getLinkageTargets` sends them with
    // every vehicle target, so the photo costs nothing beyond the read we
    // already make. The 800px asset is 800x287 and 19-25 KB, matching the
    // size article thumbnails already use.
    imageUrl: record.vehicleImages?.[0]?.imageURL800 ?? null,
  };
}

/** These arrive as `YYYY-MM` strings, unlike the `YYYYMM` integers §8.4 sends. */
function yearOf(yearMonth: string): number {
  return Number.parseInt(yearMonth.split('-')[0], 10);
}

export interface TecDocAssemblyGroupFacetResponse {
  assemblyGroupFacets?: {
    counts?: Array<{
      assemblyGroupNodeId: number;
      assemblyGroupName: string;
      parentNodeId: number | null;
    }>;
  };
}

export function mapAssemblyGroups(
  response: TecDocAssemblyGroupFacetResponse,
): AssemblyGroupDto[] {
  return (response.assemblyGroupFacets?.counts ?? []).map((node) => ({
    id: String(node.assemblyGroupNodeId),
    name: node.assemblyGroupName,
    parentId: node.parentNodeId != null ? String(node.parentNodeId) : null,
  }));
}
