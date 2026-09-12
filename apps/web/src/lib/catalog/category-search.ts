import type { CategoryTreeNode } from "./category-tree";

export interface CategoryMatch {
  node: CategoryTreeNode;
  /** Root first, `node` last — where the hit sits, and the link it carries. */
  path: CategoryTreeNode[];
}

/** Enough hits to be worth scrolling, few enough to stay one glance. */
export const CATEGORY_MATCH_LIMIT = 40;

/**
 * Below this a term is still being typed rather than searched for. Measured on
 * a 766-node tree: a single letter matches up to 678 of the nodes, so the first
 * keystroke of every search would otherwise answer with a page of noise.
 */
export const CATEGORY_SEARCH_MIN_LENGTH = 2;

export interface CategorySearchResult {
  matches: CategoryMatch[];
  /** Every hit in the tree — `matches` holds only the first {@link CATEGORY_MATCH_LIMIT}. */
  total: number;
}

/**
 * Every node whose name contains `term`, walked depth first so the tree's own
 * `sortNo` order survives into the list.
 *
 * A car's tree runs to some 773 nodes over four levels and the page opens one
 * level at a time, so without this a category three levels down is reachable
 * only by guessing which root holds it.
 *
 * The whole tree is walked even once the limit is reached, because the count of
 * what was left out is what stops the list claiming to be all of it. This caps
 * the finder alone — the grid and the drill below it never drop a category.
 */
export function searchCategoryTree(
  roots: CategoryTreeNode[],
  term: string,
  limit: number = CATEGORY_MATCH_LIMIT,
): CategorySearchResult {
  const needle = term.trim().toLowerCase();

  if (needle === "") {
    return { matches: [], total: 0 };
  }

  const matches: CategoryMatch[] = [];
  let total = 0;

  const walk = (nodes: CategoryTreeNode[], ancestors: CategoryTreeNode[]) => {
    for (const node of nodes) {
      const path = [...ancestors, node];

      if (node.category.name.toLowerCase().includes(needle)) {
        total += 1;

        if (matches.length < limit) {
          matches.push({ node, path });
        }
      }

      walk(node.children, path);
    }
  };

  walk(roots, []);

  return { matches, total };
}
