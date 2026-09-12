"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErrorState } from "@/components/ui/error-state";
import type { SelectedVehicle } from "@/hooks/use-vehicle-context";
import { categoriesQueryOptions } from "@/lib/api/catalog";
import { CATEGORY_GRID_MAX_COLUMNS } from "@/lib/catalog/category-grid-layout";
import {
  CATEGORY_SEARCH_MIN_LENGTH,
  searchCategoryTree,
} from "@/lib/catalog/category-search";
import { buildCategoryTree } from "@/lib/catalog/category-tree";
import { plural } from "@/lib/utils";
import { CategoryFinder } from "./category-finder";
import { CategoryGrid } from "./category-grid";
import { CategorySearchResults } from "./category-search-results";

interface BrowseCategoriesProps {
  vehicle: SelectedVehicle;
}

/**
 * The catalogue's categories for one car.
 *
 * The whole tree arrives in a single read — four levels, some 773 nodes for an
 * A3 — and the page opens one level at a time. Only the number of roots is
 * printed as a total: TecDoc files an article under several roots at once, so
 * summing their counts states half again the articles the car actually matches.
 */
export function BrowseCategories({ vehicle }: BrowseCategoriesProps) {
  const [term, setTerm] = useState("");
  const { data, isPending, isError, refetch } = useQuery(
    categoriesQueryOptions(vehicle.vehicleId),
  );

  const roots = useMemo(() => buildCategoryTree(data ?? []), [data]);
  const trimmedTerm = term.trim();
  const isSearching = trimmedTerm.length >= CATEGORY_SEARCH_MIN_LENGTH;
  const { matches, total } = useMemo(
    () => searchCategoryTree(roots, isSearching ? trimmedTerm : ""),
    [roots, trimmedTerm, isSearching],
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

  const vehicleName = `${vehicle.manufacturerName} ${vehicle.seriesName}`;

  function renderCategories() {
    if (roots.length === 0) {
      return (
        <p className="rounded-xl border border-line bg-bg-card px-4 py-10 text-center text-sm text-ink-3">
          TecDoc не връща категории за този автомобил. Опитайте с друг вариант
          на модела.
        </p>
      );
    }

    if (isSearching) {
      return (
        <CategorySearchResults
          matches={matches}
          total={total}
          term={trimmedTerm}
          vehicleId={vehicle.vehicleId}
        />
      );
    }

    if (trimmedTerm !== "") {
      return (
        <p className="rounded-xl border border-line bg-bg-card px-4 py-10 text-center text-sm text-ink-3">
          Въведете поне {CATEGORY_SEARCH_MIN_LENGTH} знака, за да търсите
          категория.
        </p>
      );
    }

    return (
      <CategoryGrid
        roots={roots}
        vehicleId={vehicle.vehicleId}
        vehicleName={vehicleName}
      />
    );
  }

  return (
    <section aria-labelledby="catalog-categories" className="pb-10">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            id="catalog-categories"
            className="font-display text-2xl font-semibold tracking-[-0.02em]"
          >
            Категории
          </h2>
          <p className="mt-1 text-sm text-ink-3">
            {roots.length} {plural(roots.length, "категория", "категории")} с
            части за{" "}
            <b className="font-medium text-ink">{vehicleName}</b>
          </p>
        </div>

        <CategoryFinder value={term} onChange={setTerm} />
      </div>

      {renderCategories()}
    </section>
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
