import { getArticleAvailability } from "@/lib/api/catalog";
import { ArticleBuyBox } from "./article-buy-box";

interface ArticleBuyBoxSectionProps {
  articleNumber: string;
  /** Server-driven vehicle fit, fetched with the cached catalog chrome. */
  fitsVehicle: boolean | null;
  /** Part name for the by-warehouse dialog subtitle. */
  articleName: string;
}

/**
 * The dynamic hole in the otherwise-cached article page. Fetches only live
 * price and availability on every request (never cached) — the lightweight
 * `availability`-only read, so it does not pull the full catalog payload.
 * Rendered inside a <Suspense> boundary so the cached page shell streams in
 * instantly. `fitsVehicle` is catalog data and arrives as a prop from the
 * cached chrome rather than being refetched here.
 */
export async function ArticleBuyBoxSection({
  articleNumber,
  fitsVehicle,
  articleName,
}: ArticleBuyBoxSectionProps) {
  const availability = await getArticleAvailability(articleNumber);

  return (
    <ArticleBuyBox
      available={availability.available}
      priceIncVat={availability.bestPriceIncVat}
      priceExVat={availability.bestPriceExVat}
      availabilityByWarehouse={availability.availabilityByWarehouse}
      computedAt={availability.computedAt}
      fitsVehicle={fitsVehicle}
      articleNumber={articleNumber}
      articleName={articleName}
    />
  );
}
