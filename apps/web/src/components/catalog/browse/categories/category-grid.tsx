"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  CATEGORY_GRID_MAX_COLUMNS,
  categoryGridColumns,
  chunkIntoRows,
} from "@/lib/catalog/display/category-grid-layout";
import type { CategoryScope } from "@/lib/catalog/categories/category-scope";
import type { CategoryTreeNode } from "@/lib/catalog/categories/category-tree";
import { CategoryCard } from "./category-card";
import { CategoryPanel } from "./category-panel";

interface CategoryGridProps {
  roots: CategoryTreeNode[];
  scope: CategoryScope | null;
}

const panelIdFor = (categoryId: string) => `category-panel-${categoryId}`;

/**
 * The root categories, with the open one's panel spanning the width of the row
 * it sits in.
 *
 * The rows are built here rather than left to auto-placement: a full-width item
 * dropped after a card starts a new row, which would leave the rest of that
 * card's row empty. So the column count is measured and the cards are chunked
 * to match it.
 *
 * Chunking decides only where the panel goes, so every card and the panel stay
 * direct children of the grid under a key of their own. Re-chunking after a
 * resize then moves the panel instead of remounting it, which is what keeps the
 * level it is drilled to.
 */
export function CategoryGrid({ roots, scope }: CategoryGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(CATEGORY_GRID_MAX_COLUMNS);
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);

  useLayoutEffect(() => {
    const grid = gridRef.current;

    if (!grid) {
      return;
    }

    // Zero width is a grid that has not been laid out rather than a very narrow
    // one, so it is not something to place cards on.
    const measure = (width: number) => {
      if (width > 0) {
        setColumns(categoryGridColumns(width));
      }
    };

    measure(grid.getBoundingClientRect().width);

    const observer = new ResizeObserver(([entry]) =>
      measure(entry.contentRect.width),
    );
    observer.observe(grid);

    return () => observer.disconnect();
  }, []);

  const toggle = (categoryId: string) =>
    setOpenCategoryId((openId) => (openId === categoryId ? null : categoryId));

  return (
    <div
      ref={gridRef}
      className="grid gap-3.5 [grid-template-columns:repeat(var(--category-columns),minmax(0,1fr))]"
      style={{ ["--category-columns" as string]: columns }}
    >
      {chunkIntoRows(roots, columns).flatMap((row) => {
        const cards = row.map((node) => (
          <CategoryCard
            key={node.category.id}
            node={node}
            vehicleId={scope?.vehicleId}
            isOpen={node.category.id === openCategoryId}
            panelId={panelIdFor(node.category.id)}
            onToggle={() => toggle(node.category.id)}
          />
        ));

        const openInRow = row.find(
          (node) => node.category.id === openCategoryId,
        );

        if (!openInRow) {
          return cards;
        }

        return [
          ...cards,
          <CategoryPanel
            key={`panel-${openInRow.category.id}`}
            id={panelIdFor(openInRow.category.id)}
            root={openInRow}
            scope={scope}
            onClose={() => setOpenCategoryId(null)}
          />,
        ];
      })}
    </div>
  );
}
