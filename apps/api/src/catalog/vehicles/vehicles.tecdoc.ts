import { Injectable } from '@nestjs/common';
import {
  ManufacturerDto,
  ModelSeriesDto,
  VehicleVariantDto,
  AssemblyGroupDto,
} from '@vp-parts-shop/shared';
import {
  AssemblyGroupType,
  LinkageTargetType,
  TecDocTransport,
} from '../../tecdoc';

/**
 * TecDoc source for the vehicle-selection tree: manufacturers, model series,
 * vehicle variants (linkage targets), and the per-vehicle assembly-group
 * (category) tree. All are derived from `getLinkageTargets` / `getArticles`
 * facet responses.
 *
 * Every collection below is typed optional because TecDoc omits a collection
 * rather than sending an empty one — a filter that matches nothing (an unknown
 * manufacturer, a vehicle with no catalogued parts) still returns `status: 200`,
 * just without the key. Dereferencing it directly turns an ordinary empty result
 * into a 500.
 */
@Injectable()
export class VehiclesTecDoc {
  constructor(private readonly transport: TecDocTransport) {}

  async getManufacturers(): Promise<ManufacturerDto[]> {
    const data = await this.transport.call<{
      mfrFacets?: { counts?: Array<{ id: number; name: string }> };
    }>('getLinkageTargets', {
      linkageTargetCountry: 'BG',
      lang: 'bg',
      linkageTargetType: LinkageTargetType.Vehicle,
      perPage: 0,
      page: 1,
      includeMfrFacets: true,
    });

    return (data.mfrFacets?.counts ?? []).map((c) => ({
      id: String(c.id),
      name: c.name,
    }));
  }

  async getModelSeries(manufacturerId: number): Promise<ModelSeriesDto[]> {
    const data = await this.transport.call<{
      vehicleModelSeriesFacets?: {
        counts?: Array<{ id: number; name: string }>;
      };
    }>('getLinkageTargets', {
      linkageTargetCountry: 'BG',
      lang: 'bg',
      linkageTargetType: LinkageTargetType.Vehicle,
      mfrIds: manufacturerId,
      perPage: 0,
      page: 1,
      includeVehicleModelSeriesFacets: true,
    });

    return (data.vehicleModelSeriesFacets?.counts ?? []).map((c) => ({
      id: String(c.id),
      manufacturerId: String(manufacturerId),
      name: c.name,
    }));
  }

  async getVehicleTypes(seriesId: number): Promise<VehicleVariantDto[]> {
    const data = await this.transport.call<{
      linkageTargets?: Array<{
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
      }>;
    }>('getLinkageTargets', {
      linkageTargetCountry: 'BG',
      lang: 'bg',
      linkageTargetType: LinkageTargetType.Vehicle,
      vehicleModelSeriesIds: seriesId,
      perPage: 100,
      page: 1,
    });

    return (data.linkageTargets ?? []).map((v) => ({
      vehicleId: String(v.linkageTargetId),
      seriesId: String(v.vehicleModelSeriesId),
      name: v.description,
      yearFrom: parseInt(v.beginYearMonth.split('-')[0], 10),
      yearTo: v.endYearMonth
        ? parseInt(v.endYearMonth.split('-')[0], 10)
        : null,
      engine: v.engines[0]?.code ?? '',
      powerKw: v.kiloWattsFrom,
      // Optional in the XSD, though present on all 1,268 variants measured —
      // absence is the schema's allowance rather than a case in the data.
      powerHp: v.horsePowerFrom ?? null,
      // TecDoc's own litres, not `capacityCC` divided down: it files 2,143 cc
      // as 2.2 l to match the badge on the car, where dividing reads 2.1.
      // Absent on an electric variant, which has no displacement at all.
      displacementLiters: v.capacityLiters ?? null,
      fuelType: v.fuelType,
      bodyType: v.bodyStyle,
      // No include flag turns these on — `getLinkageTargets` sends them with
      // every vehicle target, so the photo costs nothing beyond the read we
      // already make. The 800px asset is 800x287 and 19-25 KB, matching the
      // size article thumbnails already use.
      imageUrl: v.vehicleImages?.[0]?.imageURL800 ?? null,
    }));
  }

  async getAssemblyGroupTree(vehicleId: number): Promise<AssemblyGroupDto[]> {
    const data = await this.transport.call<{
      assemblyGroupFacets?: {
        counts?: Array<{
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
        assemblyGroupType: AssemblyGroupType.PassengerCar,
        includeCompleteTree: true,
      },
      linkageTargetType: LinkageTargetType.Vehicle,
      linkageTargetId: vehicleId,
    });

    return (data.assemblyGroupFacets?.counts ?? []).map((g) => ({
      id: String(g.assemblyGroupNodeId),
      name: g.assemblyGroupName,
      parentId: g.parentNodeId != null ? String(g.parentNodeId) : null,
    }));
  }
}
