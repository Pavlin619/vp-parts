export { CatalogModule } from './catalog.module';
export { BrandsModule, BrandsService, BrandsTecDoc } from './brands';
export { VehiclesService } from './vehicles/vehicles.service';
export { VehiclesTecDoc } from './vehicles/vehicles.tecdoc';
export { VehiclesController } from './vehicles/vehicles.controller';
export { ArticlesService } from './articles/articles.service';
export { ArticlesTecDoc } from './articles/articles.tecdoc';
export { ArticleReadCache } from './articles/article-read';
export { orderByAvailability } from './articles/article-ordering';
export type {
  OrderableArticle,
  OrderingAvailability,
} from './articles/article-ordering';
export { ArticleNotFoundException } from './articles/article-not-found.exception';
export { ArticlesController } from './articles/articles.controller';
export {
  ArticleIdentityQueryDto,
  ArticlesAvailabilityQueryDto,
  AVAILABILITY_MAX_ARTICLES,
  parseArticleIdentities,
} from './articles/articles.dto';
export {
  CrossReferencesController,
  CrossReferencesService,
  CrossReferencesTecDoc,
} from './articles/cross-references';
export {
  LinkedVehiclesController,
  LinkedVehiclesService,
  LinkedVehiclesTecDoc,
} from './articles/linked-vehicles';
