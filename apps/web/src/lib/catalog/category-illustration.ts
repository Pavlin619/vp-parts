/**
 * How a category is shown on the catalogue page: a bundled illustration where
 * we have one, otherwise a neutral tile.
 *
 * **TecDoc files no image for a category, and unlike the make logos there is
 * not even a near-miss to reject.** `AssemblyGroupFacetCount` is
 * `{assemblyGroupNodeId, assemblyGroupName, assemblyGroupType, parentNodeId,
 * children, count, sortNo}` — no document id, no URL — and every image type in
 * the schema belongs to an article, a data supplier or a vehicle. So category
 * illustrations are ours to ship.
 *
 * The set is bounded at 36: that is the whole passenger-car root list
 * catalogue-wide, and root node ids are global and stable, so 36 files cover
 * every car we will ever sell. Only roots are illustrated — level 2 is 490
 * nodes and rising — and every level below them renders as text.
 */

const ILLUSTRATION_DIRECTORY = "/category-illustrations";

/**
 * TecDoc `assemblyGroupNodeId` → file under `public${ILLUSTRATION_DIRECTORY}`.
 * Keyed on the id and not the name because names are not unique in the tree —
 * `филтър купе` is two different nodes under two different parents — while the
 * id is stable across trees and languages.
 *
 * Empty until the art is commissioned, which is the point of routing every tile
 * through here: an unregistered root renders the neutral tile rather than a
 * broken image, so the page ships now and each illustration lands on its own.
 * `docs/TECDOC.md` lists the 36 roots to draw.
 */
export const CATEGORY_ILLUSTRATION_FILES: Record<string, string> = {};

export function categoryIllustrationSrc(
  assemblyGroupNodeId: string,
): string | null {
  const file = CATEGORY_ILLUSTRATION_FILES[assemblyGroupNodeId];

  return file ? `${ILLUSTRATION_DIRECTORY}/${file}` : null;
}
