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
 * Vehicle-selection tree reads, Redis-cached for 7 days (stable TecDoc data).
 * Pure pass-through around {@link VehiclesTecDoc} with cache keys/TTLs — there
 * is no per-request enrichment on the vehicle tree.
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

  async getVehicleVariants(seriesId: number): Promise<VehicleVariantDto[]> {
    return this.cache.cached(
      `tecdoc:vehicle-types:${seriesId}`,
      VEHICLE_TREE_TTL,
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
