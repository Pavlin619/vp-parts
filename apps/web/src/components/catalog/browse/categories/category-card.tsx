"use client";

import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { formatCount } from "@vp-parts-shop/shared";
import { categorySearchHref } from "@/lib/catalog/category-href";
import type { CategoryTreeNode } from "@/lib/catalog/category-tree";
import { cn, plural } from "@/lib/utils";
import { CategoryThumb } from "./category-thumb";

/** How many child names a card previews before the list is only noise. */
const PREVIEW_CHILDREN = 3;

interface CategoryCardProps {
  node: CategoryTreeNode;
  /** The car a leaf's listing is scoped to, where one is picked. */
  vehicleId?: string;
  isOpen: boolean;
  /** The panel this card expands, which sits after its whole row rather than
   * directly below it — too far for the reading order alone to connect them. */
  panelId: string;
  onToggle: () => void;
}

/**
 * One root category.
 *
 * A root with children opens the drill panel below its row; a root with none
 * goes straight to the results, because there is no level left to open.
 * `почистване на фаровете` is exactly that shape, so it is not a case the page
 * can leave to chance.
 */
export function CategoryCard({
  node,
  vehicleId,
  isOpen,
  panelId,
  onToggle,
}: CategoryCardProps) {
  const hasChildren = node.children.length > 0;

  const shell = cn(
    "group grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2.5 rounded-xl",
    "border bg-bg-card p-2.5 pb-3.5 text-left transition-colors",
    isOpen ? "border-ink" : "border-line hover:border-line-2",
  );

  const body = (
    <>
      <CategoryThumb
        categoryId={node.category.id}
        className="col-span-full mb-3 aspect-[16/9] rounded-md"
      />

      <span className="min-w-0 pl-1">
        <span className="block font-display text-[16px] font-semibold leading-tight tracking-[-0.01em] text-ink">
          {node.category.name}
        </span>
        <span className="mt-1 block text-[12.5px] leading-snug text-ink-3">
          {cardSummary(node)}
        </span>
      </span>

      {hasChildren ? (
        <ChevronDown
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 text-ink-4 transition-transform",
            isOpen && "rotate-180 text-ink",
          )}
          aria-hidden="true"
        />
      ) : (
        <ArrowRight
          className="mt-0.5 h-4 w-4 shrink-0 text-ink-4 transition-colors group-hover:text-accent"
          aria-hidden="true"
        />
      )}
    </>
  );

  if (!hasChildren) {
    return (
      <Link
        href={categorySearchHref(vehicleId, [node])}
        prefetch={false}
        className={shell}
      >
        {body}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      aria-controls={isOpen ? panelId : undefined}
      className={shell}
    >
      {body}
    </button>
  );
}

/**
 * What the card says under the name: the groups inside it where there are any,
 * otherwise the count — a childless root leads straight to that list, so the
 * count is what the visitor is about to open.
 */
function cardSummary(node: CategoryTreeNode): string {
  if (node.children.length === 0) {
    const count = node.category.articleCount;

    return `${formatCount(count)} ${plural(count, "част", "части")}`;
  }

  const preview = node.children
    .slice(0, PREVIEW_CHILDREN)
    .map((child) => child.category.name)
    .join(" · ");
  const remaining = node.children.length - PREVIEW_CHILDREN;

  return remaining > 0 ? `${preview} · +${remaining}` : preview;
}
