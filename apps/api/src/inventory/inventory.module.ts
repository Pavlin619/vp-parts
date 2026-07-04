import { Module } from '@nestjs/common';
import { AutopartsRepository } from './autoparts.repository';
import { SupplierStockRepository } from './supplier-stock.repository';
import { DeliverySpeedResolver } from './delivery-speed.resolver';
import { DeliveryScheduleService } from './delivery-schedule.service';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';

@Module({
  controllers: [InventoryController],
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
