import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  LinkedVehicleManufacturerDto,
  LinkedVehicleSeriesDto,
} from '@vp-parts-shop/shared';
import { Public } from '../../../auth/public.decorator';
import { ParseRequiredTecDocIdPipe, ParseTecDocIdPipe } from '../../../tecdoc';
import { LinkedVehiclesService } from './linked-vehicles.service';

/**
 * The two routes that disclose the vehicles an article fits. Both are
 * brand-scoped for the same reason the article detail route is: the linkages are
 * per part, and an article number alone is not a part, so the wrong brand
 * answers with another part's vehicles.
 */
@Public()
@Controller('catalog/brands/:brandId/articles/:articleNumber/linked-vehicles')
export class LinkedVehiclesController {
  constructor(private readonly linkedVehicles: LinkedVehiclesService) {}

  /**
   * The makes this article fits. Read first and on its own: a part fits
   * thousands of modifications, so nothing is hydrated until a visitor opens one
   * make.
   */
  @Get('manufacturers')
  getManufacturers(
    @Param('brandId', ParseTecDocIdPipe) brandId: number,
    @Param('articleNumber') articleNumber: string,
  ): Promise<LinkedVehicleManufacturerDto[]> {
    return this.linkedVehicles.getManufacturers(brandId, articleNumber);
  }

  /**
   * Every vehicle of one make this article fits, grouped into model series.
   *
   * `manufacturerId` is required rather than optional: without it the answer is
   * every vehicle the part fits, which is the unbounded list this section
   * exists to avoid.
   */
  @Get()
  getVehicles(
    @Param('brandId', ParseTecDocIdPipe) brandId: number,
    @Param('articleNumber') articleNumber: string,
    @Query('manufacturerId', ParseRequiredTecDocIdPipe) manufacturerId: number,
  ): Promise<LinkedVehicleSeriesDto[]> {
    return this.linkedVehicles.getVehiclesByManufacturer(
      brandId,
      articleNumber,
      manufacturerId,
    );
  }
}
