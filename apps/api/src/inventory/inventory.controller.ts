import { Controller, Get, Header, Param } from '@nestjs/common';
import { AvailabilityDto } from '@vp-parts-shop/shared';
import { Public } from '../auth/public.decorator';
import { InventoryService } from './inventory.service';

/**
 * Public: price and availability are not sensitive, so anonymous shoppers can
 * read them (e.g. cart refresh before sign-in). Every response is explicitly
 * marked `Cache-Control: no-store` — this endpoint is the live availability
 * source for cart refresh and pre-checkout validation and must never be served
 * from a cache.
 */
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Public()
  @Get('articles/:articleNumber/availability')
  @Header('Cache-Control', 'no-store')
  getAvailability(
    @Param('articleNumber') articleNumber: string,
  ): Promise<AvailabilityDto> {
    return this.inventory.getAvailability(articleNumber);
  }
}
