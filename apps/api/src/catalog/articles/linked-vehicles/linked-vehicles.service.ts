import { Injectable } from '@nestjs/common';
import {
  LinkedVehicleManufacturerDto,
  LinkedVehicleSeriesDto,
} from '@vp-parts-shop/shared';
import { RedisCache } from '../../../redis';
import { ArticleLinkageRoles, LinkedVehicleWithSeries } from '../../../tecdoc';
import { LinkedVehiclesTecDoc } from './linked-vehicles.tecdoc';
import { groupVehiclesBySeries } from './vehicle-series-grouping';

const LINKED_VEHICLES_TTL = 24 * 60 * 60;
const LINKED_VEHICLES_MISS_TTL = 60 * 60;

/**
 * A vehicle record is TecDoc master data and only moves on a data release, so a
 * day is conservative — but it is also the only thing bounding how long a stale
 * row survives, since nothing here invalidates on demand. Bump
 * {@link VEHICLE_MEMO_VERSION} to make a change land sooner than that.
 */
const VEHICLE_TTL = 24 * 60 * 60;

/**
 * What a memoised vehicle row was shaped by: the fields `mapLinkedVehicle`
 * reads, the detail blocks `LinkedVehiclesTecDoc` asks for, and the language the
 * names come back in. None of that is in the `carId` the row is keyed on, so a
 * change to any of it would otherwise be served the old shape for a full TTL —
 * and a second caller wanting different detail blocks would collide outright.
 */
const VEHICLE_MEMO_VERSION = 'v1';

function vehicleMemoKey(carId: number): string {
  return `tecdoc:vehicle:${VEHICLE_MEMO_VERSION}:${carId}`;
}

function legacyArticleIdsMemoKey(
  brandId: string | number,
  articleNumber: string,
): string {
  return `tecdoc:article-legacy-ids:${brandId}:${articleNumber}`;
}

/**
 * The applicable-vehicles section: which makes an article fits, and which of a
 * make's model series and modifications.
 *
 * Owns the `tecdoc:article-legacy-ids:*` namespace, including the entries the
 * catalog listing warms on its way past via {@link rememberLinkageRoles}. Both
 * paths key it the same way because both go through this class — a second
 * writer building the key itself could drift from the reader with nothing
 * failing, leaving the section silently re-reading TecDoc per row.
 */
@Injectable()
export class LinkedVehiclesService {
  constructor(
    private readonly tecdoc: LinkedVehiclesTecDoc,
    private readonly cache: RedisCache,
  ) {}

  /**
   * The makes an article fits — the top level of the section, and the only read
   * when a visitor opens it.
   *
   * The vehicles themselves are read per make, because a common service part
   * fits thousands of modifications and no customer reads them as a list. Both
   * answers are pure TecDoc data with no inventory in them, so they cache like
   * the rest of the catalog metadata; the shorter miss TTL keeps a part briefly
   * missing its linkages from being remembered as vehicle-less for a whole day.
   */
  async getManufacturers(
    brandId: number,
    articleNumber: string,
  ): Promise<LinkedVehicleManufacturerDto[]> {
    return this.cache.cachedArray(
      `tecdoc:linked-makes:${brandId}:${articleNumber}`,
      LINKED_VEHICLES_TTL,
      LINKED_VEHICLES_MISS_TTL,
      () => this.collectManufacturers(brandId, articleNumber),
    );
  }

  /**
   * Every vehicle of one make the article fits, grouped into model series.
   *
   * One answer rather than a series level and a modifications level below it:
   * the hydration response carries the model series of each vehicle, so the
   * grouping is ours to do on data already in hand. Asking TecDoc for the
   * series separately would be a second read of the same thing, and its answer
   * could disagree with the rows underneath.
   */
  async getVehiclesByManufacturer(
    brandId: number,
    articleNumber: string,
    manufacturerId: number,
  ): Promise<LinkedVehicleSeriesDto[]> {
    return this.cache.cachedArray(
      `tecdoc:linked-vehicles:${brandId}:${articleNumber}:${manufacturerId}`,
      LINKED_VEHICLES_TTL,
      LINKED_VEHICLES_MISS_TTL,
      () => this.collectVehicles(brandId, articleNumber, manufacturerId),
    );
  }

  /**
   * Pins the linkage ids a catalog listing already carried, so expanding a row
   * does not re-read the article it came from.
   *
   * The listing asks for `includeGenericArticles` to name each row, and the same
   * field carries the linkage ids — exactly what {@link resolveLegacyArticleIds}
   * would otherwise fetch one article at a time the first time a visitor opens
   * the section.
   *
   * Rows with no role are skipped rather than memoised as an empty list: that
   * answer belongs at the shorter miss TTL, which only the read path applies.
   */
  rememberLinkageRoles(roles: ArticleLinkageRoles[]): Promise<void> {
    const entries = roles
      .filter((role) => role.legacyArticleIds.length > 0)
      .map((role) => ({
        key: legacyArticleIdsMemoKey(role.brandId, role.articleNumber),
        value: role.legacyArticleIds,
      }));

    return this.cache.writeMemos(entries, LINKED_VEHICLES_TTL);
  }

  /**
   * The makes of every role the article is filed under, merged.
   *
   * TecDoc keys linkages by `legacyArticleId`, and files one per role rather
   * than one per part, so a part catalogued as both an oil filter and a filter
   * set answers this question twice. Reading one role would drop the other's
   * vehicles from the section entirely.
   */
  private async collectManufacturers(
    brandId: number,
    articleNumber: string,
  ): Promise<LinkedVehicleManufacturerDto[]> {
    const legacyArticleIds = await this.resolveLegacyArticleIds(
      brandId,
      articleNumber,
    );

    const perRole = await Promise.all(
      legacyArticleIds.map((legacyArticleId) =>
        this.tecdoc.getLinkedManufacturers(legacyArticleId),
      ),
    );

    const byId = new Map<string, LinkedVehicleManufacturerDto>();
    for (const manufacturer of perRole.flat()) {
      byId.set(manufacturer.manufacturerId, manufacturer);
    }

    return [...byId.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  /**
   * Every vehicle of one make across the article's roles, hydrated and grouped.
   *
   * The ids are de-duplicated before hydration: two roles of the same part
   * commonly link to the same vehicle, and hydrating it twice would both cost a
   * request and list the modification twice.
   */
  private async collectVehicles(
    brandId: number,
    articleNumber: string,
    manufacturerId: number,
  ): Promise<LinkedVehicleSeriesDto[]> {
    const legacyArticleIds = await this.resolveLegacyArticleIds(
      brandId,
      articleNumber,
    );

    const perRole = await Promise.all(
      legacyArticleIds.map((legacyArticleId) =>
        this.tecdoc.getLinkedTargetIds(legacyArticleId, manufacturerId),
      ),
    );

    const targetIds = [...new Set(perRole.flat())];

    if (targetIds.length === 0) {
      return [];
    }

    const vehicles = await this.hydrateVehicles(targetIds);

    return groupVehiclesBySeries(vehicles);
  }

  /**
   * Linkage target ids turned into vehicles, reading whatever is already
   * memoised and hydrating only the rest.
   *
   * A vehicle record belongs to no article — it is TecDoc master data — so the
   * twenty brake pads on one category page all resolve the same E90
   * modifications. Keyed per `carId` rather than per article so that overlap
   * counts: without it each article pays for the same rows again.
   *
   * A `carId` TecDoc no longer has a record for is never memoised and so is
   * re-requested each time. Left alone: the answer is one id inside a batch
   * that is being sent anyway, and a tombstone would outlive the vehicle
   * coming back.
   */
  private async hydrateVehicles(
    carIds: number[],
  ): Promise<LinkedVehicleWithSeries[]> {
    const memoised = await this.cache.readMemos<LinkedVehicleWithSeries>(
      carIds.map(vehicleMemoKey),
    );

    const byCarId = new Map<number, LinkedVehicleWithSeries>();
    memoised.forEach((row, index) => {
      if (row) {
        byCarId.set(carIds[index], row);
      }
    });

    const missing = carIds.filter((carId) => !byCarId.has(carId));

    if (missing.length > 0) {
      await this.hydrateMissingVehicles(missing, byCarId);
    }

    // Rebuilt from the ids rather than concatenated, so a cached row keeps the
    // position its id had and the series grouping sees one consistent order.
    return carIds
      .map((carId) => byCarId.get(carId))
      .filter((row): row is LinkedVehicleWithSeries => row !== undefined);
  }

  private async hydrateMissingVehicles(
    carIds: number[],
    byCarId: Map<number, LinkedVehicleWithSeries>,
  ): Promise<void> {
    const rows = await this.tecdoc.getVehiclesByIds(carIds);

    for (const row of rows) {
      byCarId.set(Number(row.vehicle.vehicleId), row);
    }

    await this.cache.writeMemos(
      rows.map((row) => ({
        key: vehicleMemoKey(Number(row.vehicle.vehicleId)),
        value: row,
      })),
      VEHICLE_TTL,
    );
  }

  /**
   * The article number → `legacyArticleId` lookup, memoised because the mapping
   * only moves when TecDoc ships a data release. Only a resolved article is
   * written: an unknown number throws before the cache is touched, so a part
   * TecDoc adds tomorrow is not remembered as missing.
   *
   * Usually a hit rather than a read: the catalog listing pins the same memo for
   * every row of a page via {@link rememberLinkageRoles}, and the catalog is how
   * a visitor reaches this section.
   */
  private resolveLegacyArticleIds(
    brandId: number,
    articleNumber: string,
  ): Promise<number[]> {
    return this.cache.cachedArray(
      legacyArticleIdsMemoKey(brandId, articleNumber),
      LINKED_VEHICLES_TTL,
      LINKED_VEHICLES_MISS_TTL,
      () => this.tecdoc.getLegacyArticleIds(brandId, articleNumber),
    );
  }
}
