import { Module } from '@nestjs/common';
import { TecDocModule, tecDocSourceProvider } from '../tecdoc';
import { RedisModule } from '../redis';
import { BrandsModule } from '../catalog/brands';
import { ArticleListModule } from '../catalog/articles/article-list';
import { SearchService } from './search.service';
import { SearchTecDoc } from './search.tecdoc';
import { SearchCache } from './search-cache';
import { SearchResults } from './search-results';
import { AutocompleteService } from './autocomplete.service';
import { SearchController } from './search.controller';

// Stock is not read here: the search ranks through ArticleListModule's order
// cache, which owns the one fail-soft availability read every list shares.
@Module({
  imports: [TecDocModule, RedisModule, BrandsModule, ArticleListModule],
  controllers: [SearchController],
  providers: [
    tecDocSourceProvider(SearchTecDoc),
    SearchCache,
    SearchResults,
    AutocompleteService,
    SearchService,
  ],
  exports: [SearchService, AutocompleteService],
})
export class SearchModule {}
