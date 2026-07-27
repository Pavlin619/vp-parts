import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TecDocModule, TecDocTransport, TecDocMockClient } from '../tecdoc';
import { RedisModule } from '../redis';
import { BrandsModule } from '../catalog/brands';
import { SearchService } from './search.service';
import { SearchTecDoc } from './search.tecdoc';
import { SearchCache } from './search-cache';
import { SearchLaneResolver } from './search-lane-resolver';
import { AutocompleteService } from './autocomplete.service';
import { SearchController } from './search.controller';

@Module({
  imports: [TecDocModule, RedisModule, BrandsModule],
  controllers: [SearchController],
  providers: [
    {
      provide: SearchTecDoc,
      inject: [ConfigService, TecDocTransport, TecDocMockClient],
      useFactory: (
        config: ConfigService,
        transport: TecDocTransport,
        mock: TecDocMockClient,
      ): SearchTecDoc | TecDocMockClient =>
        config.get<string>('TECDOC_MOCK') === 'true'
          ? mock
          : new SearchTecDoc(transport),
    },
    SearchCache,
    SearchLaneResolver,
    AutocompleteService,
    SearchService,
  ],
  exports: [SearchService, AutocompleteService],
})
export class SearchModule {}
