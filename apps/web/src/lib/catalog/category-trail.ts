import type { CategoryTreeNode } from "./category-tree";

/**
 * Where the catalogue page opens on the category its URL names.
 *
 * One id places a visitor anywhere in the tree, however deep, because the page
 * holds the whole tree and `assemblyGroupNodeId` is unique across it — so the
 * root to show and the levels to open through are read from the id rather than
 * spelled out in the URL.
 */
export interface CategoryDrill {
  /** The root whose card is shown; `null` when the tree has no such node. */
  root: CategoryTreeNode | null;
  /** The levels the panel opens through, below the root. */
  path: CategoryTreeNode[];
  /**
   * The row to mark as the one arrived at, set only for a category with nothing
   * under it: the panel opens on its parent, so without a mark the visitor
   * lands on a level giving no sign of which row they asked for. A category
   * with children is the panel's own heading and needs no marking.
   */
  markedCategoryId?: string;
}

export function categoryDrillOf(
  roots: CategoryTreeNode[],
  categoryId: string | undefined,
): CategoryDrill {
  const [root, ...path] = categoryId ? trailTo(roots, categoryId) : [];

  if (!root) {
    return { root: null, path: [] };
  }

  const target = path.at(-1);

  if (target && target.children.length === 0) {
    return {
      root,
      path: path.slice(0, -1),
      markedCategoryId: target.category.id,
    };
  }

  return { root, path };
}

/** The chain from whichever of `nodes` holds the category down to it. */
function trailTo(
  nodes: CategoryTreeNode[],
  categoryId: string,
): CategoryTreeNode[] {
  for (const node of nodes) {
    if (node.category.id === categoryId) {
      return [node];
    }

    const below = trailTo(node.children, categoryId);

    if (below.length > 0) {
      return [node, ...below];
    }
  }

  return [];
}
