import Link from "next/link";
import { formatCount } from "@vp-parts-shop/shared";
import { CategoryThumb } from "@/components/catalog/browse/categories";
import { catalogCategoryHref } from "@/lib/catalog/url/catalog-url";
import type { PopularCategory } from "@/lib/catalog/categories/popular-categories";
import { plural } from "@/lib/utils";

/** Four columns inside the page container, two below 1000px. */
const THUMB_SIZES = "(max-width: 1000px) 46vw, 380px";

interface PopularCategoryCardProps {
  category: PopularCategory;
}

/**
 * One homepage category tile, leading into the catalogue narrowed to it.
 *
 * The counts here are catalogue-wide and the catalogue's are per car, so the
 * tile hands over an id and nothing else — what the narrowed page then says
 * about the category is what the visitor's own car takes.
 */
export function PopularCategoryCard({ category }: PopularCategoryCardProps) {
  return (
    <li className="flex">
      <Link
        href={catalogCategoryHref(category.id)}
        className="flex w-full flex-col rounded-xl border border-line bg-bg-card p-2.5 pb-3.5 transition-colors hover:border-ink"
      >
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
      </Link>
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
