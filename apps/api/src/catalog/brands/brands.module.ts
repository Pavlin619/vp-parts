import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TecDocModule, TecDocTransport, TecDocMockClient } from '../../tecdoc';
import { RedisModule } from '../../redis';
import { BrandsTecDoc } from './brands.tecdoc';
import { BrandsService } from './brands.service';

/**
 * Reusable brand feature module. Consumed by the catalog articles slice (row /
 * detail / substitutes logo join) and by the search module (brand dictionary +
 * facet logos). Exports only {@link BrandsService}.
 */
@Module({
  imports: [TecDocModule, RedisModule],
  providers: [
    {
      provide: BrandsTecDoc,
      inject: [ConfigService, TecDocTransport, TecDocMockClient],
      useFactory: (
        config: ConfigService,
        transport: TecDocTransport,
        mock: TecDocMockClient,
      ): BrandsTecDoc | TecDocMockClient =>
        config.get<string>('TECDOC_MOCK') === 'true'
          ? mock
          : new BrandsTecDoc(transport),
    },
    BrandsService,
  ],
  exports: [BrandsService],
})
export class BrandsModule {}
