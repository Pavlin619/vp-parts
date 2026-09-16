import type { AssemblyGroupDto } from "@vp-parts-shop/shared";

/**
 * The roots the homepage puts forward, in the order it shows them.
 *
 * A curated list rather than the head of TecDoc's own order, which opens on
 * `каросерия` — bodywork is not what a visitor arrives to replace. These eight
 * are the wear-and-service categories, and each already has an illustration in
 * `category-illustration.ts`; anything added here without one renders the
 * neutral tile.
 *
 * Keyed on `assemblyGroupNodeId` and not on the name, for the same reason the
 * illustration manifest is: root ids are global and stable, while labels repeat
 * across the tree and change with the language.
 */
export const POPULAR_CATEGORY_IDS = [
  "100005", // филтър
  "100002", // двигател
  "100006", // спирачна уредба
  "100050", // съединител/монтажни части
  "100013", // окачване и управление
  "100008", // запалителна/-подгревна система
  "100241", // отопление/вентилация
  "100214", // горивопроводна система
] as const;

/**
 * One homepage tile: a root category and how much of the catalogue sits behind
 * it. `groupCount` is the root's direct children — what the tile says about
 * depth without naming a path, since a name would be one arbitrary pick out of
 * hundreds below it.
 */
export interface PopularCategory {
  id: string;
  name: string;
  articleCount: number;
  groupCount: number;
}

/**
 * The curated roots, in curated order, from a catalogue-wide category tree.
 *
 * A root the tree does not carry is skipped rather than rendered empty — the
 * facet only returns categories that hold parts, so a missing one is a category
 * with nothing to sell.
 */
export function selectPopularCategories(
  categories: AssemblyGroupDto[],
): PopularCategory[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const childCounts = countChildren(categories);

  return POPULAR_CATEGORY_IDS.map((id) => byId.get(id))
    .filter((category): category is AssemblyGroupDto => category !== undefined)
    .map((category) => ({
      id: category.id,
      name: category.name,
      articleCount: category.articleCount,
      groupCount: childCounts.get(category.id) ?? 0,
    }));
}

/**
 * How many roots the catalogue has — the number the "all categories" link
 * offers. Counted from the tree rather than written down, so it cannot claim a
 * figure the catalogue has stopped serving.
 */
export function countCategoryRoots(categories: AssemblyGroupDto[]): number {
  return categories.filter((category) => category.parentId === null).length;
}

function countChildren(categories: AssemblyGroupDto[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const { parentId } of categories) {
    if (parentId !== null) {
      counts.set(parentId, (counts.get(parentId) ?? 0) + 1);
    }
  }

  return counts;
}
