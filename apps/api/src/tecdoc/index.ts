export { TecDocModule } from './tecdoc.module';
export { TecDocTransport } from './tecdoc-transport';
export { TecDocMockClient } from './tecdoc-mock-client';
export { tecDocSourceProvider } from './tecdoc-source.provider';
export {
  genericArticleIdsOf,
  legacyArticleIdsOf,
  linkageRolesOf,
  mapArticleSummary,
  mapOemNumbers,
} from './article-mapper';
export type {
  ArticleDetailRead,
  ArticleLinkageRoles,
  CatalogArticlesPage,
  TecDocArticleRecord,
} from './article-mapper';
export {
  ArticleStatus,
  mapCrossReferenceCandidate,
} from './cross-reference-mapper';
export type {
  CrossReferenceCandidate,
  CrossReferenceCitation,
} from './cross-reference-mapper';
export type { LinkedVehicleWithSeries } from './linked-vehicle';
export {
  CatalogRequestRejectedException,
  CatalogUnavailableException,
} from './catalog.exception';
export {
  TECDOC_SUCCESS_STATUS,
  TecDocFailure,
  classifyTecDocStatus,
} from './tecdoc-status';
export type { TecDocResponseStatus } from './tecdoc-status';
export {
  ParseRequiredTecDocIdPipe,
  ParseTecDocIdPipe,
} from './parse-tecdoc-id.pipe';
export {
  AssemblyGroupType,
  LinkageFunctionTargetType,
  LinkageTargetType,
} from './tecdoc-target-types';
