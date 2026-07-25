import { Controller, Get, Query } from '@nestjs/common';
import { AutocompleteItemDto, SearchResponseDto } from '@vp-parts-shop/shared';
import { Public } from '../auth/public.decorator';
import {
  AutocompleteQueryDto,
  SearchQueryDto,
  parseCriteriaFilters,
} from './search.dto';
import { SearchService } from './search.service';

@Public()
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  searchByPartNumber(@Query() dto: SearchQueryDto): Promise<SearchResponseDto> {
    return this.search.search(
      dto.q,
      dto.vehicleId,
      dto.page,
      dto.pageSize,
      {
        brandIds: dto.brandIds,
        categoryNodeId: dto.categoryNodeId,
        categoryHasChildren: dto.categoryHasChildren,
        criteria: parseCriteriaFilters(dto.attr),
      },
      dto.searchMode,
    );
  }

  @Get('autocomplete')
  autocomplete(
    @Query() dto: AutocompleteQueryDto,
  ): Promise<AutocompleteItemDto[]> {
    return this.search.autocomplete(dto.q ?? '', dto.searchMode);
  }
}
