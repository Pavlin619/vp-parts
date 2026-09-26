import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CatalogModule } from '../catalog';
import { CustomersModule } from '../customers';
import { PrismaModule } from '../prisma';
import { CartController } from './cart.controller';
import { CartRepository } from './cart.repository';
import { CartService } from './cart.service';

@Module({
  imports: [
    PrismaModule,
    CustomersModule,
    CatalogModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [CartController],
  providers: [CartRepository, CartService],
  exports: [CartService],
})
export class CartModule {}
