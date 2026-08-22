import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AutocompleteItemDto, SearchResponseDto } from '@vp-parts-shop/shared';
import { Public } from '../auth/public.decorator';
import {
  AutocompleteQueryDto,
  SearchQueryDto,
  parseCriteriaFilters,
} from './search.dto';
import { SearchService } from './search.service';
import { AutocompleteService } from './autocomplete.service';

// Tighter than the site-wide default: a cache miss on either route becomes a
// metered TecDoc call. Autocomplete is allowed more because it fires while
// typing, though debouncing and the client-side query cache absorb most of it.
const SEARCH_RATE_LIMIT_WINDOW_MS = 60_000;
const SEARCH_RATE_LIMIT = 30;
const AUTOCOMPLETE_RATE_LIMIT = 60;

@Public()
@Controller('search')
export class SearchController {
  constructor(
    private readonly search: SearchService,
    private readonly autocompleteService: AutocompleteService,
  ) {}

  @Get()
  @Throttle({
    default: { limit: SEARCH_RATE_LIMIT, ttl: SEARCH_RATE_LIMIT_WINDOW_MS },
  })
  searchByPartNumber(@Query() dto: SearchQueryDto): Promise<SearchResponseDto> {
    return this.search.search(
      dto.q,
      dto.vehicleId,
      dto.page,
      dto.pageSize,
      {
        brandIds: dto.brandIds,
        productTypeIds: dto.productTypeIds,
        categoryNodeId: dto.categoryNodeId,
        categoryHasChildren: dto.categoryHasChildren,
        criteria: parseCriteriaFilters(dto.attr),
      },
      dto.searchMode,
    );
  }

  @Get('autocomplete')
  @Throttle({
    default: {
      limit: AUTOCOMPLETE_RATE_LIMIT,
      ttl: SEARCH_RATE_LIMIT_WINDOW_MS,
    },
  })
  autocomplete(
    @Query() dto: AutocompleteQueryDto,
  ): Promise<AutocompleteItemDto[]> {
    return this.autocompleteService.autocomplete(dto.q ?? '', dto.searchMode);
  }
}
