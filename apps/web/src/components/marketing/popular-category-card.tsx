import { formatCount } from "@vp-parts-shop/shared";
import { CategoryThumb } from "@/components/catalog/browse/categories";
import type { PopularCategory } from "@/lib/catalog/popular-categories";
import { plural } from "@/lib/utils";

/** Four columns inside the page container, two below 1000px. */
const THUMB_SIZES = "(max-width: 1000px) 46vw, 380px";

interface PopularCategoryCardProps {
  category: PopularCategory;
}

/**
 * One homepage category tile.
 *
 * Deliberately not a link yet: the category page it belongs to does not exist,
 * and a tile that lifts under the cursor and then goes nowhere is worse than a
 * still one. Give it the `href` when that page lands.
 */
export function PopularCategoryCard({ category }: PopularCategoryCardProps) {
  return (
    <li className="flex flex-col rounded-xl border border-line bg-bg-card p-2.5 pb-3.5">
      <CategoryThumb
        categoryId={category.id}
        sizes={THUMB_SIZES}
        className="mb-3 aspect-[16/10] rounded-md"
      />

      <span className="block px-1 font-display text-[17px] font-semibold leading-tight tracking-[-0.01em] text-ink">
        {category.name}
      </span>

      <span className="mt-1.5 block px-1 font-display text-[12.5px] tabular-nums text-ink-4">
        {cardSummary(category)}
      </span>
    </li>
  );
}

/**
 * How many groups sit inside the category and how many parts it holds — depth
 * without naming a path, since one child name out of hundreds below it is an
 * arbitrary pick that reads as a promise. A root with no children at all is a
 * shape the catalogue really has (`почистване на фаровете`), and it says only
 * the count.
 */
function cardSummary({ groupCount, articleCount }: PopularCategory): string {
  const parts = formatCount(articleCount);
  const articles = `${parts} ${plural(articleCount, "артикул", "артикула")}`;

  if (groupCount === 0) {
    return articles;
  }

  return `${groupCount} ${plural(groupCount, "група", "групи")} · ${articles}`;
}
