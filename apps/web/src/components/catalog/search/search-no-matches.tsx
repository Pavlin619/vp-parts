import Link from "next/link";
import { FilterX } from "lucide-react";
import {
  buildSearchUrl,
  clearAllFilters,
  type SearchUrlState,
} from "@/lib/catalog/search-url";

interface SearchNoMatchesProps {
  state: SearchUrlState;
}

/**
 * Zero results *because of the filters*, which is a different dead end from a
 * query that matches nothing: the query is fine and the way out is to drop a
 * narrowing, not to retype. The full no-results state with its "did you mean"
 * suggestions would be misleading here.
 */
export function SearchNoMatches({ state }: SearchNoMatchesProps) {
  return (
    <section
      aria-label="Няма резултати за избраните филтри"
      className="rounded-[12px] border border-line bg-bg-card px-6 py-12 text-center"
    >
      <FilterX className="mx-auto mb-4 h-8 w-8 text-ink-4" aria-hidden="true" />

      <h2 className="mb-1 text-base font-semibold text-ink">
        Няма артикули за избраните филтри
      </h2>
      <p className="mb-5 text-sm text-muted">
        Опитайте с по-малко ограничения — премахнете марка, категория или
        размер.
      </p>

      <Link
        href={buildSearchUrl(clearAllFilters(state))}
        prefetch={false}
        className="inline-flex h-10 items-center rounded-lg bg-ink px-4 text-sm font-medium text-white transition-colors hover:bg-ink/90"
      >
        Изчисти всички филтри
      </Link>
    </section>
  );
}
