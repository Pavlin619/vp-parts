import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  buildSearchUrl,
  withPage,
  type SearchUrlState,
} from "@/lib/catalog/search-url";
import { cn } from "@/lib/utils";

/** Numbered links shown at once; beyond this the window slides with the page. */
const PAGE_WINDOW = 7;

interface SearchPaginationProps {
  state: SearchUrlState;
  total: number;
  pageSize: number;
  /**
   * The last page the API will serve, which is not `total / pageSize` — TecDoc
   * stops paging a match set after roughly its first 10,000 results.
   */
  maxPage: number;
}

export function SearchPagination({
  state,
  total,
  pageSize,
  maxPage,
}: SearchPaginationProps) {
  if (maxPage <= 1) {
    return null;
  }

  const page = Math.min(state.page, maxPage);
  const firstShown = (page - 1) * pageSize + 1;
  const lastShown = Math.min(page * pageSize, total);

  // A broad query's count and its last page can differ by orders of magnitude,
  // so the numbers stop well short of the total printed beside them. Saying why
  // beats letting the pager simply end.
  const reachable = maxPage * pageSize;
  const isTruncated = reachable < total;

  return (
    <div className="mt-6">
      <nav
        aria-label="Страници с резултати"
        className="flex items-center justify-center gap-3.5"
      >
        <PageStep
          state={state}
          page={page - 1}
          isDisabled={page <= 1}
          label="Предишна"
          icon="left"
        />

        <ul className="flex gap-1">
          {pageWindow(page, maxPage).map((candidate) => (
            <li key={candidate}>
              <Link
                href={buildSearchUrl(withPage(state, candidate))}
                prefetch={false}
                aria-label={`Страница ${candidate}`}
                aria-current={candidate === page ? "page" : undefined}
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-full font-display text-[13px] font-semibold transition-colors",
                  candidate === page
                    ? "bg-ink text-white"
                    : "text-ink-3 hover:bg-bg-sunken hover:text-ink",
                )}
              >
                {candidate}
              </Link>
            </li>
          ))}
        </ul>

        <PageStep
          state={state}
          page={page + 1}
          isDisabled={page >= maxPage}
          label="Следваща"
          icon="right"
        />
      </nav>

      <p className="mt-2.5 text-center text-xs text-ink-4">
        Показани {firstShown}–{lastShown} от {total} артикула
        {isTruncated && ` (достъпни са първите ${reachable})`}
      </p>
    </div>
  );
}

function PageStep({
  state,
  page,
  isDisabled,
  label,
  icon,
}: {
  state: SearchUrlState;
  page: number;
  isDisabled: boolean;
  label: string;
  icon: "left" | "right";
}) {
  const Icon = icon === "left" ? ChevronLeft : ChevronRight;
  const className =
    "inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[12.5px] font-medium";

  // A step that leads nowhere is rendered as inert text rather than a link, so
  // it cannot be focused or followed by keyboard.
  if (isDisabled) {
    return (
      <span aria-hidden="true" className={cn(className, "text-ink-3 opacity-35")}>
        {icon === "left" && <Icon className="h-3.5 w-3.5" />}
        {label}
        {icon === "right" && <Icon className="h-3.5 w-3.5" />}
      </span>
    );
  }

  return (
    <Link
      href={buildSearchUrl(withPage(state, page))}
      prefetch={false}
      className={cn(
        className,
        "bg-canvas text-ink-2 transition-colors hover:border-ink-3 hover:text-ink",
      )}
    >
      {icon === "left" && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
      {label}
      {icon === "right" && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
    </Link>
  );
}

/** A {@link PAGE_WINDOW}-wide run of page numbers centred on the current page. */
export function pageWindow(page: number, totalPages: number): number[] {
  const start = Math.max(
    1,
    Math.min(page - Math.floor(PAGE_WINDOW / 2), totalPages - PAGE_WINDOW + 1),
  );
  const length = Math.min(PAGE_WINDOW, totalPages);

  return Array.from({ length }, (_, index) => start + index);
}
