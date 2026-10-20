import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog';
import { CustomersModule } from '../customers';
import { InventoryModule } from '../inventory';
import { PrismaModule } from '../prisma';
import { CartController } from './cart.controller';
import { CartRepository } from './cart.repository';
import { CartService } from './cart.service';
import { ProductTypeParcelProfileRepository } from './shipping-profile/product-type-parcel-profile.repository';
import { ShippingProfileResolver } from './shipping-profile/shipping-profile.resolver';

@Module({
  imports: [PrismaModule, CustomersModule, CatalogModule, InventoryModule],
  controllers: [CartController],
  providers: [
    CartRepository,
    CartService,
    ShippingProfileResolver,
    ProductTypeParcelProfileRepository,
  ],
  exports: [CartService, CartRepository],
})
export class CartModule {}
