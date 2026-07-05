import { Module } from '@nestjs/common';
import { AutopartsRepository } from './autoparts.repository';
import { SupplierStockRepository } from './supplier-stock.repository';
import { DeliverySpeedResolver } from './delivery-speed.resolver';
import { DeliveryScheduleService } from './delivery-schedule.service';
import { InventoryService } from './inventory.service';

// No controller: availability is exposed to clients via the catalog endpoint
// (`GET /catalog/articles/:n?include=availability`). InventoryService is the
// in-process contract other modules (catalog, future checkout) consume.
@Module({
  providers: [
    AutopartsRepository,
    SupplierStockRepository,
    DeliverySpeedResolver,
    DeliveryScheduleService,
    InventoryService,
  ],
  exports: [InventoryService],
})
export class InventoryModule {}
