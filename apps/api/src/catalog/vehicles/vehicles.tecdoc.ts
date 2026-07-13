import { Injectable } from '@nestjs/common';
import {
  ManufacturerDto,
  ModelSeriesDto,
  VehicleVariantDto,
  AssemblyGroupDto,
} from '@vp-parts-shop/shared';
import { TecDocTransport } from '../../tecdoc';

/**
 * TecDoc source for the vehicle-selection tree: manufacturers, model series,
 * vehicle variants (linkage targets), and the per-vehicle assembly-group
 * (category) tree. All are derived from `getLinkageTargets` / `getArticles`
 * facet responses.
 */
@Injectable()
export class VehiclesTecDoc {
  constructor(private readonly transport: TecDocTransport) {}

  async getManufacturers(): Promise<ManufacturerDto[]> {
    const data = await this.transport.call<{
      mfrFacets: { counts: Array<{ id: number; name: string }> };
    }>('getLinkageTargets', {
      linkageTargetCountry: 'BG',
      lang: 'bg',
      linkageTargetType: 'P',
      perPage: 0,
      page: 1,
      includeMfrFacets: true,
    });

    return data.mfrFacets.counts.map((c) => ({
      id: String(c.id),
      name: c.name,
    }));
  }

  async getModelSeries(manufacturerId: string): Promise<ModelSeriesDto[]> {
    const data = await this.transport.call<{
      vehicleModelSeriesFacets: { counts: Array<{ id: number; name: string }> };
    }>('getLinkageTargets', {
      linkageTargetCountry: 'BG',
      lang: 'bg',
      linkageTargetType: 'P',
      mfrIds: Number(manufacturerId),
      perPage: 0,
      page: 1,
      includeVehicleModelSeriesFacets: true,
    });

    return data.vehicleModelSeriesFacets.counts.map((c) => ({
      id: String(c.id),
      manufacturerId,
      name: c.name,
    }));
  }

  async getVehicleTypes(seriesId: string): Promise<VehicleVariantDto[]> {
    const data = await this.transport.call<{
      linkageTargets: Array<{
        linkageTargetId: number;
        vehicleModelSeriesId: number;
        description: string;
        beginYearMonth: string;
        endYearMonth: string | null;
        engines: Array<{ code: string }>;
        kiloWattsFrom: number;
        fuelType: string;
        bodyStyle: string;
      }>;
    }>('getLinkageTargets', {
      linkageTargetCountry: 'BG',
      lang: 'bg',
      linkageTargetType: 'P',
      vehicleModelSeriesIds: Number(seriesId),
      perPage: 100,
      page: 1,
    });

    return data.linkageTargets.map((v) => ({
      vehicleId: String(v.linkageTargetId),
      seriesId: String(v.vehicleModelSeriesId),
      name: v.description,
      yearFrom: parseInt(v.beginYearMonth.split('-')[0], 10),
      yearTo: v.endYearMonth
        ? parseInt(v.endYearMonth.split('-')[0], 10)
        : null,
      engine: v.engines[0]?.code ?? '',
      powerKw: v.kiloWattsFrom,
      fuelType: v.fuelType,
      bodyType: v.bodyStyle,
    }));
  }

  async getAssemblyGroupTree(vehicleId: string): Promise<AssemblyGroupDto[]> {
    const data = await this.transport.call<{
      assemblyGroupFacets: {
        counts: Array<{
          assemblyGroupNodeId: number;
          assemblyGroupName: string;
          parentNodeId: number | null;
        }>;
      };
    }>('getArticles', {
      articleCountry: 'BG',
      lang: 'bg',
      perPage: 0,
      page: 1,
      assemblyGroupFacetOptions: {
        enabled: true,
        assemblyGroupType: 'P',
        includeCompleteTree: true,
      },
      linkageTargetType: 'P',
      linkageTargetId: Number(vehicleId),
    });

    return data.assemblyGroupFacets.counts.map((g) => ({
      id: String(g.assemblyGroupNodeId),
      name: g.assemblyGroupName,
      parentId: g.parentNodeId != null ? String(g.parentNodeId) : null,
    }));
  }
}
