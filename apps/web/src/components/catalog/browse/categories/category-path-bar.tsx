"use client";

import { ChevronLeft } from "lucide-react";
import type { CategoryTreeNode } from "@/lib/catalog/category-tree";

const SEGMENT =
  "rounded-full px-2 py-0.5 text-xs text-ink-3 transition-colors hover:bg-canvas hover:text-ink";

interface CategoryPathBarProps {
  rootName: string;
  /** The drill below the root; its last entry is the panel's own heading. */
  path: CategoryTreeNode[];
  /** Called with how many entries of `path` to keep — 0 returns to the root. */
  onNavigate: (depth: number) => void;
}

/**
 * Where the open panel currently is, and every level it can step back to. The
 * deepest node is left out: it is the heading directly below this bar.
 */
export function CategoryPathBar({
  rootName,
  path,
  onNavigate,
}: CategoryPathBarProps) {
  if (path.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Ниво в категорията"
      className="mb-1.5 flex flex-wrap items-center gap-1.5"
    >
      <button
        type="button"
        onClick={() => onNavigate(path.length - 1)}
        className="inline-flex items-center gap-1 rounded-full border border-line-2 py-0.5 pl-1.5 pr-2.5 text-xs font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink"
      >
        <ChevronLeft className="h-3 w-3" aria-hidden="true" />
        Назад
      </button>

      <button type="button" onClick={() => onNavigate(0)} className={SEGMENT}>
        {rootName}
      </button>

      {path.slice(0, -1).map((node, index) => (
        <span
          key={node.category.id}
          className="inline-flex items-center gap-1.5"
        >
          <span aria-hidden="true" className="text-xs text-ink-4">
            ›
          </span>
          <button
            type="button"
            onClick={() => onNavigate(index + 1)}
            className={SEGMENT}
          >
            {node.category.name}
          </button>
        </span>
      ))}
    </nav>
  );
}
