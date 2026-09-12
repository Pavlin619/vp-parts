"use client";

import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { formatCount } from "@vp-parts-shop/shared";
import { categorySearchHref } from "@/lib/catalog/category-href";
import type { CategoryTreeNode } from "@/lib/catalog/category-tree";
import { cn, plural } from "@/lib/utils";

const ROW_SHELL =
  "group flex w-full items-center gap-3.5 py-3 pl-0.5 pr-1.5 text-left transition-[padding-left] hover:pl-2";

interface CategoryPanelRowProps {
  node: CategoryTreeNode;
  /** The chain above `node`, root first — what a link has to carry with it. */
  ancestors: CategoryTreeNode[];
  /** The car a leaf's listing is scoped to, where one is picked. */
  vehicleId?: string;
  onDrill: (node: CategoryTreeNode) => void;
}

/**
 * One line of the open panel. A group descends a level; a node with nothing
 * below it is a listing, so it leaves for the search.
 */
export function CategoryPanelRow({
  node,
  ancestors,
  vehicleId,
  onDrill,
}: CategoryPanelRowProps) {
  const hasChildren = node.children.length > 0;
  const articleCount = node.category.articleCount;

  const label = (
    <>
      <span
        className={cn(
          "text-[15px] text-ink-2 transition-colors group-hover:text-ink",
          hasChildren &&
            "font-display text-[16px] font-semibold tracking-[-0.01em] text-ink",
        )}
      >
        {node.category.name}
      </span>

      <span className="ml-auto shrink-0 font-display text-xs tabular-nums text-ink-3">
        {hasChildren
          ? `${node.children.length} ${plural(node.children.length, "подгрупа", "подгрупи")} · ${formatCount(articleCount)}`
          : `${formatCount(articleCount)} ${plural(articleCount, "част", "части")}`}
      </span>
    </>
  );

  return (
    <li className="break-inside-avoid border-b border-line">
      {hasChildren ? (
        <button type="button" onClick={() => onDrill(node)} className={ROW_SHELL}>
          {label}
          <ChevronRight
            className="h-3.5 w-3.5 shrink-0 text-ink-4"
            aria-hidden="true"
          />
        </button>
      ) : (
        <Link
          href={categorySearchHref(vehicleId, [...ancestors, node])}
          prefetch={false}
          className={ROW_SHELL}
        >
          {label}
          <ArrowRight
            className="h-3.5 w-3.5 shrink-0 text-ink-4 transition-colors group-hover:text-accent"
            aria-hidden="true"
          />
        </Link>
      )}
    </li>
  );
}
