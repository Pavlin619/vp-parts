import { Controller, Get, Header, Param } from '@nestjs/common';
import { AvailabilityDto } from '@vp-parts-shop/shared';
import { InventoryService } from './inventory.service';

/**
 * Protected by the global JwtGuard. Every response is explicitly marked
 * `Cache-Control: no-store` — this endpoint is the live availability source for
 * cart refresh and pre-checkout validation and must never be served from a cache.
 */
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('articles/:articleNumber/availability')
  @Header('Cache-Control', 'no-store')
  getAvailability(
    @Param('articleNumber') articleNumber: string,
  ): Promise<AvailabilityDto> {
    return this.inventory.getAvailability(articleNumber);
  }
}
