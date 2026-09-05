import { Injectable } from '@nestjs/common';
import {
  ManufacturerDto,
  ModelSeriesDto,
  VehicleVariantDto,
  AssemblyGroupDto,
} from '@vp-parts-shop/shared';
import { RedisCache } from '../../redis';
import { VehiclesTecDoc } from './vehicles.tecdoc';

const VEHICLE_TREE_TTL = 7 * 24 * 60 * 60;

/**
 * Shorter than the rest of the tree because this payload alone carries a
 * perishable field — see {@link VehiclesService.getVehicleVariants}.
 */
const VEHICLE_VARIANT_TTL = 12 * 60 * 60;

/**
 * Vehicle-selection tree reads. Manufacturers, model series and the category
 * tree are Redis-cached for 7 days (stable TecDoc data); variants get 12 hours
 * — see {@link VehiclesService.getVehicleVariants}. Pure pass-through around
 * {@link VehiclesTecDoc} — there is no per-request enrichment here.
 */
@Injectable()
export class VehiclesService {
  constructor(
    private readonly tecdoc: VehiclesTecDoc,
    private readonly cache: RedisCache,
  ) {}

  async getManufacturers(): Promise<ManufacturerDto[]> {
    return this.cache.cached('tecdoc:manufacturers:all', VEHICLE_TREE_TTL, () =>
      this.tecdoc.getManufacturers(),
    );
  }

  async getModelSeries(manufacturerId: number): Promise<ModelSeriesDto[]> {
    return this.cache.cached(
      `tecdoc:model-series:${manufacturerId}`,
      VEHICLE_TREE_TTL,
      () => this.tecdoc.getModelSeries(manufacturerId),
    );
  }

  /**
   * Held for half a day rather than the tree's week, because this is the only
   * read whose payload carries `vehicleImages` — and TecDoc mints those URLs as
   * a signed token per response, with no documented lifetime and none readable
   * from the token itself (146 opaque bytes; two minted for one photo share
   * only chance-level bytes, so there is no plaintext expiry to parse).
   *
   * The TTL is therefore an upper bound on the token age we hand a browser, not
   * a guess at freshness: an entry read just before it expires is that old.
   * `scripts/vehicle-image-token-probe.mjs` measures the real ceiling — 20.1 h
   * proven alive so far, so 12 h leaves margin on a sample of one. Raise this
   * only behind a longer rung: 24 h wants a token alive at ~44 h.
   *
   * A dead URL costs a placeholder rather than a broken image, because the
   * preview sidebar falls back on the image's error event.
   */
  async getVehicleVariants(seriesId: number): Promise<VehicleVariantDto[]> {
    return this.cache.cached(
      `tecdoc:vehicle-types:${seriesId}`,
      VEHICLE_VARIANT_TTL,
      () => this.tecdoc.getVehicleTypes(seriesId),
    );
  }

  async getCategoryTree(vehicleId: number): Promise<AssemblyGroupDto[]> {
    return this.cache.cached(
      `tecdoc:assembly-groups:${vehicleId}`,
      VEHICLE_TREE_TTL,
      () => this.tecdoc.getAssemblyGroupTree(vehicleId),
    );
  }
}
