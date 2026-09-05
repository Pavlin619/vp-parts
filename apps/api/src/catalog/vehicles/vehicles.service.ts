import { Injectable } from '@nestjs/common';
import {
  ManufacturerDto,
  ModelSeriesDto,
  VehicleVariantDto,
  AssemblyGroupDto,
} from '@vp-parts-shop/shared';
import { RedisCache } from '../../redis';
import { orderManufacturers } from './manufacturer-ordering';
import { SELECTABLE_VEHICLES, VehiclesTecDoc } from './vehicles.tecdoc';

const VEHICLE_TREE_TTL = 7 * 24 * 60 * 60;

/**
 * Shorter than the rest of the tree because this payload alone carries a
 * perishable field — see {@link VehiclesService.getVehicleVariants}.
 */
const VEHICLE_VARIANT_TTL = 24 * 60 * 60;

/**
 * Vehicle-selection tree reads. Manufacturers, model series and the category
 * tree are Redis-cached for 7 days (stable TecDoc data); variants get a day
 * — see {@link VehiclesService.getVehicleVariants}.
 *
 * Three of the four steps are a cached pass-through to {@link VehiclesTecDoc}.
 * The make list is the one that is not: TecDoc answers it in two calls that
 * this service issues together and merges — see {@link collectManufacturers}.
 *
 * The three keys over enumerated data name their {@link SELECTABLE_VEHICLES}
 * scope, so changing it takes effect on deploy instead of a week later. The
 * category tree does not, because it is read per vehicle and is not scoped.
 */
@Injectable()
export class VehiclesService {
  constructor(
    private readonly tecdoc: VehiclesTecDoc,
    private readonly cache: RedisCache,
  ) {}

  async getManufacturers(): Promise<ManufacturerDto[]> {
    return this.cache.cached(
      `tecdoc:manufacturers:${SELECTABLE_VEHICLES}`,
      VEHICLE_TREE_TTL,
      () => this.collectManufacturers(),
    );
  }

  async getModelSeries(manufacturerId: number): Promise<ModelSeriesDto[]> {
    return this.cache.cached(
      `tecdoc:model-series:${SELECTABLE_VEHICLES}:${manufacturerId}`,
      VEHICLE_TREE_TTL,
      () => this.tecdoc.getModelSeries(manufacturerId),
    );
  }

  /**
   * Held for a day rather than the tree's week, because this is the only
   * read whose payload carries `vehicleImages` — and TecDoc mints those URLs as
   * a signed token per response, with no documented lifetime and none readable
   * from the token itself (146 opaque bytes; two minted for one photo share
   * only chance-level bytes, so there is no plaintext expiry to parse).
   *
   * The TTL is therefore an upper bound on the token age we hand a browser, not
   * a guess at freshness: an entry read just before it expires is that old.
   * `scripts/vehicle-image-token-probe.mjs` measures the real ceiling: one token
   * served byte-identical at 6.9 h, 20.1 h and 27.1 h, and none has been seen to
   * die yet. A day sits inside that by only ~3 h, which is thin — bearable only
   * because a dead URL costs a placeholder rather than a broken image, the
   * preview sidebar falling back on the image's error event.
   *
   * Raise it further only against a token left *untouched* until the target age.
   * The probe re-checks every token on every run, so if the proxy slides a
   * window on access, its ladder overstates the life of a token that sits
   * unread for a day and is fetched once — this cache's exact access pattern.
   */
  async getVehicleVariants(seriesId: number): Promise<VehicleVariantDto[]> {
    return this.cache.cached(
      `tecdoc:vehicle-types:${SELECTABLE_VEHICLES}:${seriesId}`,
      VEHICLE_VARIANT_TTL,
      () => this.tecdoc.getVehicleVariants(seriesId),
    );
  }

  async getCategoryTree(vehicleId: number): Promise<AssemblyGroupDto[]> {
    return this.cache.cached(
      `tecdoc:assembly-groups:${vehicleId}`,
      VEHICLE_TREE_TTL,
      () => this.tecdoc.getAssemblyGroupTree(vehicleId),
    );
  }

  /**
   * Two calls, because no single function answers both halves. The facet is the
   * make list; `getManufacturers2` is the only place TecDoc says which makes it
   * considers popular, and it says nothing else we need. They share no
   * parameters, so they go out together.
   *
   * Neither read may fail soft. The merged list is cached for a week, so
   * swallowing a refused popularity read would pin a flagless list — no popular
   * section at all — for seven days on one bad response. Letting `Promise.all`
   * reject caches nothing and costs the next request a retry.
   */
  private async collectManufacturers(): Promise<ManufacturerDto[]> {
    const [facet, popularIds] = await Promise.all([
      this.tecdoc.getManufacturerFacet(),
      this.tecdoc.getPopularManufacturerIds(),
    ]);

    return orderManufacturers(facet, popularIds);
  }
}
