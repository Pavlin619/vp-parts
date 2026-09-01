import { PackageCheck, SlidersHorizontal } from "lucide-react";
import type { SearchOrdering } from "@vp-parts-shop/shared";

interface SearchOrderingNoteProps {
  ordering: SearchOrdering;
}

/**
 * What the order of the results on screen means.
 *
 * A search we can rank leads with the parts we can actually ship, and saying so
 * is what makes the first rows worth reading. A match set too wide to rank is
 * served in the catalogue's own order — that one is a prompt, not an apology:
 * the sidebar is one selection away from a ranked list, and a visitor who is not
 * told will keep paging an order that means nothing to them.
 */
export function SearchOrderingNote({ ordering }: SearchOrderingNoteProps) {
  const isRanked = ordering === "availability";
  const Icon = isRanked ? PackageCheck : SlidersHorizontal;

  return (
    <p className="mb-4 flex items-start gap-1.5 text-xs text-ink-4">
      <Icon className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {isRanked
        ? "Първо частите в наличност, с най-бърза доставка и най-добра цена."
        : "Твърде много резултати, за да ги подредим по наличност. Уточнете търсенето с филтрите отляво."}
    </p>
  );
}
