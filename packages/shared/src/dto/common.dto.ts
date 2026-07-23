export interface PaginatedDto<TItem> {
  total: number;
  page: number;
  pageSize: number;
  items: TItem[];
}
