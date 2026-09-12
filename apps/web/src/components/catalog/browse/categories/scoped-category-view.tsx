"use client";

import { useState } from "react";
import { catalogCategoryHref } from "@/lib/catalog/catalog-url";
import type { CategoryScope } from "@/lib/catalog/category-scope";
import type { CategoryTreeNode } from "@/lib/catalog/category-tree";
import { CategoryCard } from "./category-card";
import { CategoryPanel } from "./category-panel";

interface ScopedCategoryViewProps {
  root: CategoryTreeNode;
  /** The levels below the root the panel opens through — see `categoryDrillOf`. */
  initialPath?: CategoryTreeNode[];
  /** The row on that level the visitor arrived on, if any. */
  markedCategoryId?: string;
  scope: CategoryScope | null;
}

const PANEL_ID = "scoped-category-panel";

/**
 * The catalogue narrowed to one root: its card, with the drill panel already
 * open beside it — on the level the URL asked for, which may be several below
 * the root.
 *
 * The same card and the same panel the full grid uses — a narrowed catalogue is
 * a state of the catalogue, not a second template. Only the layout differs: the
 * panel sits next to the card rather than under the row, because one card in a
 * four-column row would leave three columns of nothing beside it.
 */
export function ScopedCategoryView({
  root,
  initialPath,
  markedCategoryId,
  scope,
}: ScopedCategoryViewProps) {
  const hasChildren = root.children.length > 0;
  const [isOpen, setOpen] = useState(hasChildren);

  // Reopening the panel is not arriving again: the level a link named is where
  // it opens once, and the root is where it opens after the visitor closed it.
  const [isArrival, setArrival] = useState(true);

  function closePanel() {
    setOpen(false);
    setArrival(false);
    recordLevelInUrl(root.category.id);
  }

  return (
    <div className="grid items-start gap-3.5 min-[1000px]:grid-cols-4">
      <CategoryCard
        node={root}
        vehicleId={scope?.vehicleId}
        isOpen={isOpen}
        panelId={PANEL_ID}
        onToggle={() => (isOpen ? closePanel() : setOpen(true))}
      />

      {isOpen && hasChildren && (
        <CategoryPanel
          id={PANEL_ID}
          root={root}
          scope={scope}
          initialPath={isArrival ? initialPath : undefined}
          markedCategoryId={isArrival ? markedCategoryId : undefined}
          onLevelChange={recordLevelInUrl}
          onClose={closePanel}
          className="min-[1000px]:col-span-3"
        />
      )}
    </div>
  );
}

/**
 * Keeps `?category=` naming the level the panel is actually on, so a reload or
 * a shared link lands where the visitor is standing rather than where they came
 * in.
 *
 * Written with the history API rather than `router.replace` because drilling is
 * not a navigation: the whole tree is already in the client, so a round trip
 * would re-render nothing — and the categories are keyed on this param, so a
 * navigation would remount the panel it is recording. `replaceState` rather
 * than `pushState` for the same reason Back should leave the page: a drill is
 * one screen deep, and four levels of history would strand a visitor who
 * arrived from an article.
 */
function recordLevelInUrl(categoryId: string) {
  window.history.replaceState(null, "", catalogCategoryHref(categoryId));
}
