import Link from "next/link";
import { SearchX } from "lucide-react";
import type { AutocompleteItemDto } from "@vp-parts-shop/shared";

interface SearchEmptyStateProps {
  query: string;
  suggestions?: AutocompleteItemDto[];
}

export function SearchEmptyState({ query, suggestions }: SearchEmptyStateProps) {
  return (
    <section
      aria-label="Няма резултати"
      className="flex flex-col items-center text-center py-16 px-4"
    >
      <SearchX className="w-10 h-10 text-muted mb-4" aria-hidden="true" />

      <h1 className="text-xl font-semibold text-ink mb-2">
        {query
          ? `Няма намерени части за „${query}"`
          : "Въведете номер на част, за да търсите"}
      </h1>

      <p className="text-sm text-muted max-w-md mb-6">
        Проверете дали номерът е изписан правилно, или опитайте един от
        следните начини да намерите частта:
      </p>

      {suggestions && suggestions.length > 0 && (
        <div className="mb-8 w-full max-w-md text-left">
          <p className="text-sm font-medium text-ink mb-3">
            Може би търсите:
          </p>
          <ul className="flex flex-col gap-2">
            {suggestions.map((suggestion) => (
              <li key={`${suggestion.brandName}-${suggestion.articleNumber}`}>
                <Link
                  href={`/catalog/articles/${encodeURIComponent(suggestion.articleNumber)}`}
                  className="flex items-center gap-3 px-4 py-2.5 bg-bg-card border border-line rounded-lg hover:border-ink transition-colors"
                >
                  <span className="font-mono text-xs text-muted min-w-[80px]">
                    {suggestion.articleNumber}
                  </span>
                  <span className="text-xs font-semibold text-muted uppercase tracking-wide">
                    {suggestion.brandName}
                  </span>
                  <span className="text-sm text-ink truncate">
                    {suggestion.description}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-3 mb-8">
        <Link
          href="/vehicles"
          className="h-10 px-4 inline-flex items-center bg-ink text-white rounded-lg text-sm font-medium hover:bg-ink/90 transition-colors"
        >
          Търси по автомобил
        </Link>
        <Link
          href="/"
          className="h-10 px-4 inline-flex items-center border border-line text-ink rounded-lg text-sm font-medium hover:bg-bg-sunken transition-colors"
        >
          Разгледай категориите
        </Link>
      </div>

      <p className="text-sm text-muted">
        Не откривате частта?{" "}
        <a
          href="tel:+35921234567"
          className="text-ink font-medium underline underline-offset-2"
        >
          Свържете се с нас
        </a>{" "}
        — ще я намерим за вас.
      </p>
    </section>
  );
}
