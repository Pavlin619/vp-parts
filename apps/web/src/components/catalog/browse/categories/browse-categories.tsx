"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatCount } from "@vp-parts-shop/shared";
import { ErrorState } from "@/components/ui/error-state";
import { categoriesQueryOptions } from "@/lib/api/catalog";
import { CATEGORY_GRID_MAX_COLUMNS } from "@/lib/catalog/category-grid-layout";
import {
  CATEGORY_SEARCH_MIN_LENGTH,
  searchCategoryTree,
} from "@/lib/catalog/category-search";
import type { CategoryScope } from "@/lib/catalog/category-scope";
import {
  buildCategoryTree,
  type CategoryTreeNode,
} from "@/lib/catalog/category-tree";
import { plural } from "@/lib/utils";
import { CategoryFinder } from "./category-finder";
import { CategoryGrid } from "./category-grid";
import { CategoryScopeBar } from "./category-scope-bar";
import { CategorySearchResults } from "./category-search-results";
import { ScopeNote } from "./scope-note";
import { ScopedCategoryView } from "./scoped-category-view";

interface BrowseCategoriesProps {
  /** The car the tree is read for; `null` reads the whole catalogue's. */
  scope: CategoryScope | null;
  /** The root the page is narrowed to, from the URL. Absent shows all of them. */
  scopedCategoryId?: string;
}

/**
 * The catalogue's categories, either all of them or the one root the URL names.
 *
 * One car or none reaches the same screen: the vehicle-scoped tree is a subset
 * of the catalogue-wide one — an A3's 773 nodes are drawn from the catalogue's
 * 1,315 — so both are the same four-level shape and the grid, the panel and the
 * finder over them do not differ. What changes is which read answers, which
 * counts the numbers are, and whether a search link carries a vehicle.
 *
 * The whole tree arrives in a single read and the page opens one level at a
 * time. Only the number of roots is printed as a total: TecDoc files an article
 * under several roots at once, so summing their counts states half again the
 * articles actually matched.
 *
 * Narrowing is a state of this screen rather than a page of its own: the card,
 * the panel and the finder are the same, and dropping the narrowing is one
 * click on the scope bar.
 */
export function BrowseCategories({
  scope,
  scopedCategoryId,
}: BrowseCategoriesProps) {
  const [term, setTerm] = useState("");
  const { data, isPending, isError, refetch } = useQuery(
    categoriesQueryOptions(scope?.vehicleId),
  );

  const roots = useMemo(() => buildCategoryTree(data ?? []), [data]);
  const scopedRoot = useMemo(
    () =>
      roots.find((root) => root.category.id === scopedCategoryId) ?? null,
    [roots, scopedCategoryId],
  );

  const trimmedTerm = term.trim();
  const isSearching = trimmedTerm.length >= CATEGORY_SEARCH_MIN_LENGTH;
  const { matches, total } = useMemo(
    () =>
      searchCategoryTree(
        scopedRoot ? [scopedRoot] : roots,
        isSearching ? trimmedTerm : "",
      ),
    [roots, scopedRoot, trimmedTerm, isSearching],
  );

  if (isPending) {
    return <CategoriesSkeleton />;
  }

  if (isError) {
    return (
      <ErrorState
        variant="inline"
        message="Категориите не се заредиха."
        onRetry={() => refetch()}
      />
    );
  }

  function renderCategories() {
    if (roots.length === 0) {
      return <Notice>{emptyTreeNotice(scope)}</Notice>;
    }

    // A root id the tree in hand does not carry: a stale link, or — under a car
    // — a category whose parts this model takes none of. Either way the scope
    // bar above is the way on, so the page is not a dead end.
    if (scopedCategoryId && !scopedRoot) {
      return (
        <Notice>
          {missingRootNotice(scope)} Разгледайте останалите {roots.length}{" "}
          {plural(roots.length, "категория", "категории")}.
        </Notice>
      );
    }

    if (isSearching) {
      return (
        <CategorySearchResults
          matches={matches}
          total={total}
          term={trimmedTerm}
          vehicleId={scope?.vehicleId}
        />
      );
    }

    if (trimmedTerm !== "") {
      return (
        <Notice>
          Въведете поне {CATEGORY_SEARCH_MIN_LENGTH} знака, за да търсите
          категория.
        </Notice>
      );
    }

    if (scopedRoot) {
      return (
        <ScopedCategoryView
          key={scopedRoot.category.id}
          root={scopedRoot}
          scope={scope}
        />
      );
    }

    return <CategoryGrid roots={roots} scope={scope} />;
  }

  return (
    <section aria-labelledby="catalog-categories" className="pb-10">
      {scopedCategoryId && <CategoryScopeBar rootCount={roots.length} />}

      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            id="catalog-categories"
            className="font-display text-2xl font-semibold tracking-[-0.02em]"
          >
            {scopedRoot ? scopedRoot.category.name : "Категории"}
          </h2>
          <p className="mt-1 text-sm text-ink-3">
            {scopedRoot ? scopeSummary(scopedRoot) : rootsSummary(roots.length)}{" "}
            <ScopeNote scope={scope} />
          </p>
        </div>

        <CategoryFinder
          value={term}
          onChange={setTerm}
          placeholder={
            scopedRoot
              ? `Търси в „${scopedRoot.category.name}“…`
              : undefined
          }
        />
      </div>

      {renderCategories()}
    </section>
  );
}

function rootsSummary(rootCount: number): string {
  return `${rootCount} ${plural(rootCount, "категория", "категории")} с части`;
}

/**
 * An empty tree means different things per scope. Under a car it is ordinary —
 * a variant TecDoc files no linked articles for, which another variant of the
 * same model usually fixes. Catalogue-wide it cannot happen, so there is
 * nothing to suggest but trying again.
 */
function emptyTreeNotice(scope: CategoryScope | null): string {
  return scope
    ? "TecDoc не връща категории за този автомобил. Опитайте с друг вариант на модела."
    : "Каталогът не връща категории в момента. Опитайте отново по-късно.";
}

function missingRootNotice(scope: CategoryScope | null): string {
  return scope
    ? `Тази категория няма части за ${scope.vehicleName}.`
    : "Тази категория не е в каталога.";
}

/**
 * What the narrowed page counts instead of roots: the groups directly inside
 * the category, and the articles it holds. A root's own count is the one total
 * that is safe to print — it is the overlap *between* roots that makes a sum of
 * them wrong.
 */
function scopeSummary(root: CategoryTreeNode): string {
  const articleCount = root.category.articleCount;
  const articles = `${formatCount(articleCount)} ${plural(articleCount, "артикул", "артикула")}`;
  const groupCount = root.children.length;

  if (groupCount === 0) {
    return articles;
  }

  return `${groupCount} ${plural(groupCount, "група", "групи")} · ${articles}`;
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-line bg-bg-card px-4 py-10 text-center text-sm text-ink-3">
      {children}
    </p>
  );
}

/**
 * Breakpoints match `categoryGridColumns`, which the grid applies to its own
 * width rather than the viewport's — close enough that the skeleton is replaced
 * by the same number of columns it was standing in for.
 */
function CategoriesSkeleton() {
  return (
    <div
      aria-label="Зареждане на категориите"
      aria-busy="true"
      className="grid grid-cols-2 gap-3.5 min-[680px]:grid-cols-3 min-[1000px]:grid-cols-4"
    >
      {Array.from({ length: CATEGORY_GRID_MAX_COLUMNS * 2 }).map((_, index) => (
        <div
          key={index}
          className="h-[212px] animate-pulse rounded-xl bg-bg-sunken"
        />
      ))}
    </div>
  );
}
