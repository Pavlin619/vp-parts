import { Controller, Get, Param } from '@nestjs/common';
import {
  ManufacturerDto,
  ModelSeriesDto,
  VehicleVariantDto,
  AssemblyGroupDto,
} from '@vp-parts-shop/shared';
import { Public } from '../../auth/public.decorator';
import { ParseTecDocIdPipe } from '../../tecdoc';
import { VehiclesService } from './vehicles.service';

@Public()
@Controller('catalog')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get('manufacturers')
  getManufacturers(): Promise<ManufacturerDto[]> {
    return this.vehicles.getManufacturers();
  }

  @Get('manufacturers/:manufacturerId/model-series')
  getModelSeries(
    @Param('manufacturerId', ParseTecDocIdPipe) manufacturerId: number,
  ): Promise<ModelSeriesDto[]> {
    return this.vehicles.getModelSeries(manufacturerId);
  }

  @Get('model-series/:seriesId/variants')
  getVehicleVariants(
    @Param('seriesId', ParseTecDocIdPipe) seriesId: number,
  ): Promise<VehicleVariantDto[]> {
    return this.vehicles.getVehicleVariants(seriesId);
  }

  @Get('vehicles/:vehicleId/categories')
  getCategoryTree(
    @Param('vehicleId', ParseTecDocIdPipe) vehicleId: number,
  ): Promise<AssemblyGroupDto[]> {
    return this.vehicles.getCategoryTree(vehicleId);
  }
}
