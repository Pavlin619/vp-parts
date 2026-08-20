import { Module } from '@nestjs/common';
import { TecDocModule, tecDocSourceProvider } from '../tecdoc';
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
    tecDocSourceProvider(SearchTecDoc),
    SearchCache,
    SearchLaneResolver,
    AutocompleteService,
    SearchService,
  ],
  exports: [SearchService, AutocompleteService],
})
export class SearchModule {}
