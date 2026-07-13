import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TecDocModule, TecDocTransport, TecDocMockClient } from '../tecdoc';
import { RedisModule } from '../redis';
import { InventoryModule } from '../inventory';
import { BrandsModule } from './brands';
import { VehiclesTecDoc } from './vehicles/vehicles.tecdoc';
import { VehiclesService } from './vehicles/vehicles.service';
import { VehiclesController } from './vehicles/vehicles.controller';
import { ArticlesTecDoc } from './articles/articles.tecdoc';
import { ArticlesService } from './articles/articles.service';
import { ArticlesController } from './articles/articles.controller';

@Module({
  imports: [TecDocModule, RedisModule, BrandsModule, InventoryModule],
  controllers: [VehiclesController, ArticlesController],
  providers: [
    {
      provide: VehiclesTecDoc,
      inject: [ConfigService, TecDocTransport, TecDocMockClient],
      useFactory: (
        config: ConfigService,
        transport: TecDocTransport,
        mock: TecDocMockClient,
      ): VehiclesTecDoc | TecDocMockClient =>
        config.get<string>('TECDOC_MOCK') === 'true'
          ? mock
          : new VehiclesTecDoc(transport),
    },
    VehiclesService,
    {
      provide: ArticlesTecDoc,
      inject: [ConfigService, TecDocTransport, TecDocMockClient],
      useFactory: (
        config: ConfigService,
        transport: TecDocTransport,
        mock: TecDocMockClient,
      ): ArticlesTecDoc | TecDocMockClient =>
        config.get<string>('TECDOC_MOCK') === 'true'
          ? mock
          : new ArticlesTecDoc(transport),
    },
    ArticlesService,
  ],
})
export class CatalogModule {}
