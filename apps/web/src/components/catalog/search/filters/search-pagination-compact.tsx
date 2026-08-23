import { ChevronLeft, ChevronRight } from "lucide-react";
import type { SearchUrlState } from "@/lib/catalog/search-url";
import { cn } from "@/lib/utils";
import { SearchPageStep } from "./search-page-step";

const STEP = "grid h-7 w-7 place-items-center rounded-full border border-line";
const STEP_INERT = "text-ink-3 opacity-35";
const STEP_LINK =
  "bg-canvas text-ink-3 transition-colors hover:border-ink-3 hover:text-ink";

interface SearchPaginationCompactProps {
  state: SearchUrlState;
  /**
   * The last page the API will serve, which is not `total / pageSize` — TecDoc
   * stops paging a match set after roughly its first 10,000 results.
   */
  maxPage: number;
}

/**
 * The pager that sits with the match count, above the results. It carries no
 * page numbers and no range line: the full pager below the list is the one that
 * says where you are in the match set, and this is the way back up out of a
 * long page without scrolling to the bottom first.
 */
export function SearchPaginationCompact({
  state,
  maxPage,
}: SearchPaginationCompactProps) {
  if (maxPage <= 1) {
    return null;
  }

  const page = Math.min(state.page, maxPage);
  const isFirst = page <= 1;
  const isLast = page >= maxPage;

  return (
    <nav
      aria-label="Навигация по страници"
      className="flex shrink-0 items-center gap-1.5"
    >
      <SearchPageStep
        state={state}
        page={page - 1}
        isDisabled={isFirst}
        label="Предишна страница"
        className={cn(STEP, isFirst ? STEP_INERT : STEP_LINK)}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </SearchPageStep>

      <p className="font-display text-[12.5px] font-medium tabular-nums text-ink-3">
        <span className="sr-only">
          Страница {page} от {maxPage}
        </span>
        <span aria-hidden="true">
          {page}/{maxPage}
        </span>
      </p>

      <SearchPageStep
        state={state}
        page={page + 1}
        isDisabled={isLast}
        label="Следваща страница"
        className={cn(STEP, isLast ? STEP_INERT : STEP_LINK)}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </SearchPageStep>
    </nav>
  );
}
