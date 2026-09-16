/**
 * The API path identifying one specific article. An article number is unique
 * only within a TecDoc brand (`dataSupplierId`), so both halves are always sent
 * together — a number-only lookup resolves to whichever brand the catalogue
 * happened to sort first.
 */
export function articlePath(brandId: string, articleNumber: string): string {
  return `/catalog/brands/${encodeURIComponent(brandId)}/articles/${encodeURIComponent(articleNumber)}`;
}

/**
 * How long a read-on-demand catalog-row section's answer stays fresh, and how
 * long it survives with nothing subscribed to it.
 *
 * Pure TecDoc catalog data with no inventory in it, so it ages far more slowly
 * than anything price-bearing. `gcTime` matches `staleTime` rather than being
 * left at the app-wide five minutes: these sections unmount the moment they are
 * collapsed, and a five-minute `gcTime` would drop the answer long before it
 * went stale, so closing and reopening one would refetch.
 */
const ROW_SECTION_LIFETIME = 60 * 60 * 1000;

export const ROW_SECTION_CACHE = {
  staleTime: ROW_SECTION_LIFETIME,
  gcTime: ROW_SECTION_LIFETIME,
} as const;
