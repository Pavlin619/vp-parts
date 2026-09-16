"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatCount } from "@vp-parts-shop/shared";
import { categorySearchHref } from "@/lib/catalog/links/category-href";
import type { CategoryMatch } from "@/lib/catalog/categories/category-search";
import { plural } from "@/lib/utils";

interface CategorySearchResultsProps {
  matches: CategoryMatch[];
  /** Every hit the term has, of which `matches` may be only the first page. */
  total: number;
  /** The term as typed, already trimmed — printed back and highlighted. */
  term: string;
  /** The car every hit's listing is scoped to, where one is picked. */
  vehicleId?: string;
}

/**
 * What the find box answers with.
 *
 * Every hit goes to the search, a group as much as a leaf: a group's listing is
 * a destination in its own right, and the results page carries the same drill
 * in its sidebar, so a visitor who wanted the level below has not lost it.
 */
export function CategorySearchResults({
  matches,
  total,
  term,
  vehicleId,
}: CategorySearchResultsProps) {
  if (matches.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-bg-card px-4 py-10 text-center">
        <p className="text-sm font-medium text-ink">Нищо за „{term}“</p>
        <p className="mt-1 text-[13px] text-ink-3">
          Опитайте с друга дума или изчистете търсенето, за да разгледате
          категориите.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-bg-card p-2">
      <p className="px-3 pb-2 pt-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">
        {matches.length < total
          ? `Първите ${matches.length} от ${total} съвпадения`
          : `${total} ${plural(total, "съвпадение", "съвпадения")}`}{" "}
        за „{term}“
      </p>

      <ul>
        {matches.map(({ node, path }) => (
          <li key={path.map((step) => step.category.id).join("/")}>
            <Link
              href={categorySearchHref(vehicleId, path)}
              prefetch={false}
              className="group flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-canvas"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-ink">
                  <HighlightedName name={node.category.name} term={term} />
                </span>
                <span className="truncate text-xs text-ink-3">
                  {ancestorTrail(path)}
                </span>
              </span>

              <span className="ml-auto shrink-0 font-display text-xs tabular-nums text-ink-4">
                {formatCount(node.category.articleCount)}
              </span>

              {node.children.length > 0 && (
                <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-4">
                  група
                </span>
              )}

              <ArrowRight
                className="h-3.5 w-3.5 shrink-0 text-ink-4 transition-colors group-hover:text-accent"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Where the hit sits. Names repeat across the tree — `филтър купе` is filed
 * under both `филтър` and `отопление/вентилация` — so a row without its
 * ancestors is two identical rows.
 */
function ancestorTrail(path: CategoryMatch["path"]): string {
  const ancestors = path.slice(0, -1);

  return ancestors.length > 0
    ? ancestors.map((step) => step.category.name).join(" › ")
    : "Основна категория";
}

function HighlightedName({ name, term }: { name: string; term: string }) {
  const start = name.toLowerCase().indexOf(term.toLowerCase());

  if (start < 0) {
    return <>{name}</>;
  }

  const end = start + term.length;

  return (
    <>
      {name.slice(0, start)}
      <mark className="rounded-[2px] bg-accent-soft px-px text-accent-hover">
        {name.slice(start, end)}
      </mark>
      {name.slice(end)}
    </>
  );
}
