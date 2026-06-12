import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog';
import { PartNumberNormaliser } from './normaliser';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';

@Module({
  imports: [CatalogModule],
  controllers: [SearchController],
  providers: [PartNumberNormaliser, SearchService],
  exports: [SearchService],
})
export class SearchModule {}
