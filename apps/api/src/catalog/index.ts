export { CatalogModule } from './catalog.module';
export { BrandsModule, BrandsService, BrandsTecDoc } from './brands';
export { VehiclesService } from './vehicles/vehicles.service';
export { VehiclesTecDoc } from './vehicles/vehicles.tecdoc';
export { VehiclesController } from './vehicles/vehicles.controller';
export { ArticlesService } from './articles/articles.service';
export { ArticlesTecDoc, SUBSTITUTES_LIMIT } from './articles/articles.tecdoc';
export { ArticleNotFoundException } from './articles/article-not-found.exception';
export { ArticlesController } from './articles/articles.controller';
export {
  ArticlesAvailabilityQueryDto,
  AVAILABILITY_MAX_ARTICLE_NUMBERS,
  parseArticleNumbers,
} from './articles/articles.dto';
