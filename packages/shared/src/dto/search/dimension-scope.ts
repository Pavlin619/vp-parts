/**
 * The narrowing facts the technical-dimension (criteria) facets are gated on.
 *
 * Reduced to counts and booleans because neither side's own filter type fits
 * the other: the API holds product types as a numeric multi-select and the web
 * app as one optional string id. What has to be shared is the rule, not the
 * representation.
 */
export interface DimensionScope {
  /** How many product types (TecDoc genericArticleIds) are selected. */
  productTypeCount: number;
  /** Whether any category (TecDoc assemblyGroupNodeId) is selected. */
  hasCategory: boolean;
  /**
   * `hasChildren` of the selected category as the client reported it. Only an
   * explicit `false` is a leaf — absent means the client never said, which is
   * how a caller declines to be charged for the criteria block.
   */
  categoryHasChildren?: boolean;
}

/**
 * Whether the selection has narrowed enough for the dimension facets to mean
 * something. Lives here rather than in either app because both must agree: the
 * API decides whether to ask TecDoc for the criteria block, and the web app
 * decides whether to render one — and a web app holding the stricter rule
 * discards a block the API already paid for.
 *
 * Either narrowing qualifies:
 *
 * - **One product type.** TecDoc defines its criteria per generic article, so a
 *   single selected type is the strongest guarantee available that every match
 *   shares one set of dimensions. Two are already a union of two criteria sets,
 *   so only one qualifies.
 * - **A leaf category.** Weaker than the above — a leaf can still span several
 *   product types, as an "Oil filter" leaf holds filters and their housings,
 *   whose criteria have nothing in common — but coherent enough to be worth
 *   offering.
 *
 * Paging is deliberately not part of this. The API computes the block on the
 * first page only, and the client retains it while paginating, so page number
 * answers "is a block available here", not "is one meaningful here".
 */
export function hasCoherentDimensions(scope: DimensionScope): boolean {
  const isSingleProductType = scope.productTypeCount === 1;
  const isLeafCategory =
    scope.hasCategory && scope.categoryHasChildren === false;

  return isSingleProductType || isLeafCategory;
}
