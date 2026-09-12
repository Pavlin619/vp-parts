"use client";

import { useState } from "react";
import type { CategoryScope } from "@/lib/catalog/category-scope";
import type { CategoryTreeNode } from "@/lib/catalog/category-tree";
import { CategoryCard } from "./category-card";
import { CategoryPanel } from "./category-panel";

interface ScopedCategoryViewProps {
  root: CategoryTreeNode;
  scope: CategoryScope | null;
}

const PANEL_ID = "scoped-category-panel";

/**
 * The catalogue narrowed to one root: its card, with the drill panel already
 * open beside it.
 *
 * The same card and the same panel the full grid uses — a narrowed catalogue is
 * a state of the catalogue, not a second template. Only the layout differs: the
 * panel sits next to the card rather than under the row, because one card in a
 * four-column row would leave three columns of nothing beside it.
 */
export function ScopedCategoryView({ root, scope }: ScopedCategoryViewProps) {
  const hasChildren = root.children.length > 0;
  const [isOpen, setOpen] = useState(hasChildren);

  return (
    <div className="grid items-start gap-3.5 min-[1000px]:grid-cols-4">
      <CategoryCard
        node={root}
        vehicleId={scope?.vehicleId}
        isOpen={isOpen}
        panelId={PANEL_ID}
        onToggle={() => setOpen((open) => !open)}
      />

      {isOpen && hasChildren && (
        <CategoryPanel
          id={PANEL_ID}
          root={root}
          scope={scope}
          onClose={() => setOpen(false)}
          className="min-[1000px]:col-span-3"
        />
      )}
    </div>
  );
}
