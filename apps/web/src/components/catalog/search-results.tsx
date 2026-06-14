import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import type { SearchResultItemDto } from "@vp-parts-shop/shared";
import { formatPrice } from "@vp-parts-shop/shared";

interface SearchResultsProps {
  query: string;
  results: SearchResultItemDto[];
}

function VehicleFitIndicator({ fitsVehicle }: { fitsVehicle: boolean | null }) {
  if (fitsVehicle === null) {
    return null;
  }

  if (fitsVehicle) {
    return (
      <span className="inline-flex items-center gap-1 text-ok text-xs font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
        Подходяща за вашия автомобил
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-danger text-xs font-medium">
      <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
      Не е подходяща за вашия автомобил
    </span>
  );
}

export function SearchResults({ query, results }: SearchResultsProps) {
  return (
    <section aria-label="Резултати от търсенето">
      <h1 className="text-xl font-semibold text-ink mb-1">
        Резултати за „{query}“
      </h1>
      <p className="text-sm text-muted mb-6">
        {results.length} намерени части
      </p>

      <ul className="flex flex-col gap-3">
        {results.map((result) => (
          <li key={`${result.brandName}-${result.articleNumber}`}>
            <Link
              href={`/catalog/articles/${encodeURIComponent(result.articleNumber)}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-bg-card border border-line rounded-[12px] px-4 py-3 hover:border-ink transition-colors"
            >
              <div className="flex-1 min-w-[200px]">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">
                  {result.brandName}
                </p>
                <p className="text-sm font-medium text-ink">
                  {result.description}
                </p>
                <p className="font-mono text-xs text-muted">
                  Арт. № {result.articleNumber}
                </p>
              </div>

              <VehicleFitIndicator fitsVehicle={result.fitsVehicle} />

              {result.available ? (
                <span className="inline-flex items-center h-5 px-2 rounded bg-ok-soft text-ok text-[11px] font-semibold uppercase tracking-wide">
                  В наличност
                </span>
              ) : (
                <span className="inline-flex items-center h-5 px-2 rounded bg-danger/10 text-danger text-[11px] font-semibold uppercase tracking-wide">
                  Временно изчерпан
                </span>
              )}

              <p
                className="font-display font-semibold text-ink text-base min-w-[80px] text-right"
                style={{ fontFeatureSettings: '"tnum"' }}
              >
                {result.available && result.bestPriceIncVat != null
                  ? formatPrice(result.bestPriceIncVat)
                  : "—"}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
