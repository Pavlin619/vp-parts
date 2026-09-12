"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { formatCount } from "@vp-parts-shop/shared";
import { categorySearchHref } from "@/lib/catalog/category-href";
import type { CategoryScope } from "@/lib/catalog/category-scope";
import type { CategoryTreeNode } from "@/lib/catalog/category-tree";
import { cn, plural } from "@/lib/utils";
import { CategoryPanelRow } from "./category-panel-row";
import { CategoryPathBar } from "./category-path-bar";
import { ScopeNote } from "./scope-note";

interface CategoryPanelProps {
  id: string;
  root: CategoryTreeNode;
  /** What the counts below are for, stated once at the top of the panel. */
  scope: CategoryScope | null;
  onClose: () => void;
  /** Where the panel sits when the layout around it is not the full grid. */
  className?: string;
}

/**
 * The level a card opened, and every level below it.
 *
 * One level is on screen at a time however deep the branch runs — the tree is
 * four levels and up to 26 wide, which no single expanded outline survives — so
 * a group descends and the path bar is the way back up. Nothing below the cards
 * is illustrated: only the 36 roots have an image to show.
 */
export function CategoryPanel({
  id,
  root,
  scope,
  onClose,
  className,
}: CategoryPanelProps) {
  const [path, setPath] = useState<CategoryTreeNode[]>([]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const renderedDepth = useRef(path.length);

  const trail = [root, ...path];
  const current = trail[trail.length - 1];
  const level = current.children;
  const articleCount = current.category.articleCount;

  // Descending replaces the level, destroying the row that had focus. Without
  // this the caret falls back to the body and a screen reader is told nothing.
  useEffect(() => {
    if (renderedDepth.current === path.length) {
      return;
    }

    renderedDepth.current = path.length;
    headingRef.current?.focus();
  }, [path.length]);

  return (
    <section
      id={id}
      aria-label={`Групи в ${root.category.name}`}
      className={cn(
        "col-span-full rounded-xl border border-ink bg-bg-card p-5 sm:px-6",
        className,
      )}
    >
      <div className="mb-4 flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-[200px] flex-1">
          <CategoryPathBar
            rootName={root.category.name}
            path={path}
            onNavigate={(depth) => setPath((drill) => drill.slice(0, depth))}
          />

          <h3
            ref={headingRef}
            tabIndex={-1}
            className="font-display text-[24px] font-semibold leading-tight tracking-[-0.01em] outline-none"
          >
            {current.category.name}
          </h3>
          <p className="mt-1 text-[13px] text-ink-3">
            {level.length} {levelKind(level, path.length)} ·{" "}
            {formatCount(articleCount)}{" "}
            {plural(articleCount, "артикул", "артикула")}{" "}
            <ScopeNote scope={scope} />
          </p>
        </div>

        <Link
          href={categorySearchHref(scope?.vehicleId, trail)}
          prefetch={false}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium text-ink transition-colors hover:border-ink"
        >
          Всички {formatCount(articleCount)}{" "}
          {plural(articleCount, "част", "части")}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>

        <button
          type="button"
          onClick={onClose}
          aria-label="Затвори"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-bg-sunken hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <ul className="border-t border-line md:columns-2 md:[column-gap:52px]">
        {level.map((node) => (
          <CategoryPanelRow
            key={node.category.id}
            node={node}
            ancestors={trail}
            vehicleId={scope?.vehicleId}
            onDrill={(child) => setPath((drill) => [...drill, child])}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * What the row count is counting. A level whose entries all bottom out is a set
 * of listings rather than a set of groups, and saying so is what tells a visitor
 * the tree has run out before they click.
 */
function levelKind(level: CategoryTreeNode[], depth: number): string {
  if (!level.some((node) => node.children.length > 0)) {
    return plural(level.length, "група части", "групи части");
  }

  return depth > 0
    ? plural(level.length, "подгрупа", "подгрупи")
    : plural(level.length, "група", "групи");
}
