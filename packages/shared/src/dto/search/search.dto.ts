import type {
  ArticleSummaryDto,
  PaginatedCatalogArticlesDto,
} from '../catalog/articles.dto';
import type { AutocompleteItemDto } from './autocomplete.dto';

export interface FacetValueDto {
  id: string;
  label: string;
  count: number;
  imageUrl?: string | null;
}

export interface SearchFacetDto {
  id: 'brands';
  label: string;
  values: FacetValueDto[];
}

export interface AttributeFacetValueDto {
  value: string;
  label: string;
  count: number;
}

/**
 * A semantic role the client can render with a dedicated control.
 */
export type AttributeFacetRole = 'fitting-position' | 'axle' | 'side';

export interface AttributeFacetDto {
  id: string;
  label: string;
  unit?: string | null;
  type: string;
  isInterval: boolean;
  role?: AttributeFacetRole | null;
  values: AttributeFacetValueDto[];
}

export interface CategoryOptionDto {
  id: string;
  label: string;
  count: number | null;
  hasChildren: boolean;
}

/**
 * Single-level category navigation for progressively narrowing a search.
 */
export interface CategoryNavigationDto {
  current: CategoryOptionDto | null;
  options: CategoryOptionDto[];
}

export type PaginatedSearchArticlesDto = PaginatedCatalogArticlesDto & {
  facets: SearchFacetDto[];
  attributes: AttributeFacetDto[];
  categoryNavigation: CategoryNavigationDto;
};

export interface SearchResponseDto {
  query?: string;
  results?: ArticleSummaryDto[];
  total?: number;
  page?: number;
  pageSize?: number;
  facets?: SearchFacetDto[];
  attributes?: AttributeFacetDto[];
  categoryNavigation?: CategoryNavigationDto;
  suggestions?: AutocompleteItemDto[];
}
