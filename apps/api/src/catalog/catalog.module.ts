import { Module } from '@nestjs/common';
import { TecDocModule, tecDocSourceProvider } from '../tecdoc';
import { RedisModule } from '../redis';
import { InventoryModule } from '../inventory';
import { BrandsModule } from './brands';
import {
  VehiclesController,
  VehiclesService,
  VehiclesTecDoc,
} from './vehicles';
import { ArticleListModule } from './articles/article-list';
import { ArticleReadCache } from './articles/article-read';
import { ArticlesTecDoc } from './articles/articles.tecdoc';
import { ArticlesService } from './articles/articles.service';
import { ArticlesController } from './articles/articles.controller';
import {
  CrossReferencesController,
  CrossReferencesService,
  CrossReferencesTecDoc,
} from './articles/cross-references';
import {
  LinkedVehiclesController,
  LinkedVehiclesService,
  LinkedVehiclesTecDoc,
} from './articles/linked-vehicles';

@Module({
  imports: [
    TecDocModule,
    RedisModule,
    BrandsModule,
    InventoryModule,
    ArticleListModule,
  ],
  controllers: [
    VehiclesController,
    ArticlesController,
    CrossReferencesController,
    LinkedVehiclesController,
  ],
  providers: [
    tecDocSourceProvider(VehiclesTecDoc),
    VehiclesService,
    tecDocSourceProvider(ArticlesTecDoc),
    ArticlesService,
    ArticleReadCache,
    tecDocSourceProvider(CrossReferencesTecDoc),
    CrossReferencesService,
    tecDocSourceProvider(LinkedVehiclesTecDoc),
    LinkedVehiclesService,
  ],
})
export class CatalogModule {}
