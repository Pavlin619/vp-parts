export { CatalogModule } from './catalog.module';
export { BrandsModule, BrandsService, BrandsTecDoc } from './brands';
export { VehiclesService } from './vehicles/vehicles.service';
export { VehiclesTecDoc } from './vehicles/vehicles.tecdoc';
export { VehiclesController } from './vehicles/vehicles.controller';
export { ArticlesService } from './articles/articles.service';
export { ArticlesTecDoc, SUBSTITUTES_LIMIT } from './articles/articles.tecdoc';
export {
  ArticlesController,
  parseArticleNumbers,
} from './articles/articles.controller';
