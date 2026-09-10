import type { AssemblyGroupDto } from "@vp-parts-shop/shared";

/**
 * One node of a vehicle's category tree with its children attached.
 *
 * The API serves the tree flat and depth first, ordered by TecDoc's `sortNo`;
 * rebuilding it here preserves that order within every sibling group, so the
 * nav opens on `каросерия`/`двигател` rather than alphabetically on
 * `вътрешно обурудване`.
 */
export interface CategoryTreeNode {
  category: AssemblyGroupDto;
  children: CategoryTreeNode[];
}

export function buildCategoryTree(categories: AssemblyGroupDto[]): CategoryTreeNode[] {
  const nodesById = new Map<string, CategoryTreeNode>();
  const roots: CategoryTreeNode[] = [];

  for (const category of categories) {
    nodesById.set(category.id, { category, children: [] });
  }

  for (const category of categories) {
    const node = nodesById.get(category.id)!;
    const parent = category.parentId ? nodesById.get(category.parentId) : undefined;

    // A node whose parent is not in the payload is shown rather than dropped —
    // a category withheld is a part that cannot be found.
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
