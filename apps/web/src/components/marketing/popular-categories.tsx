import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getCatalogCategories } from "@/lib/api/catalog";
import {
  countCategoryRoots,
  selectPopularCategories,
} from "@/lib/catalog/popular-categories";
import { plural } from "@/lib/utils";
import { PopularCategoryCard } from "./popular-category-card";

/**
 * The eight categories the homepage puts forward, over the catalogue-wide tree.
 *
 * Counted over the whole catalogue and not over a car, deliberately: the
 * homepage is where a visitor arrives before choosing one, and a tile that
 * changed its number depending on a vehicle picked three visits ago would
 * make the page tell a different story to each visitor. The narrowing belongs
 * to the catalogue, where the car is named and reversible.
 */
export async function PopularCategories() {
  const tree = await getCatalogCategories();
  const categories = selectPopularCategories(tree);
  const rootCount = countCategoryRoots(tree);

  if (categories.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="popular-categories" className="page-container pb-16">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            id="popular-categories"
            className="font-display text-[32px] font-semibold tracking-[-0.02em] text-ink"
          >
            Популярни категории
          </h2>
          <p className="mt-1.5 text-[15px] text-ink-3">
            Най-често поръчвани части по категории
          </p>
        </div>

        <Link
          href="/catalog"
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-bg-card px-3.5 py-1.5 text-[12.5px] text-ink-3 transition-colors hover:border-ink hover:text-ink"
        >
          Всички {rootCount} {plural(rootCount, "категория", "категории")}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <ul className="grid grid-cols-2 gap-3.5 min-[1000px]:grid-cols-4">
        {categories.map((category) => (
          <PopularCategoryCard key={category.id} category={category} />
        ))}
      </ul>
    </section>
  );
}
