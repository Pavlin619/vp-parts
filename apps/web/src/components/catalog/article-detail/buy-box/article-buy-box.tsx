"use client";

import { useQuery } from "@tanstack/react-query";
import { availabilityQueryOptions } from "@/lib/api/catalog";
import { UNAVAILABLE_DETAIL } from "@/lib/catalog/merge-availability";
import { AvailabilityLoadError } from "@/components/catalog/availability-load-error";
import { ArticleBuyBoxContent } from "./article-buy-box-content";
import { ArticleBuyBoxSkeleton } from "./article-buy-box-skeleton";

interface ArticleBuyBoxProps {
  /** Identifies the part — drives the live availability read and cart. */
  articleNumber: string;
  /** Server-driven vehicle fit, passed from the cached catalog chrome. */
  fitsVehicle: boolean | null;
  /** Part name for the by-warehouse dialog subtitle. */
  articleName?: string;
  vehicleName?: string;
  /** Wired to the cart store in US4. Optional until then. */
  onAddToCart?: (quantity: number) => void;
}

/**
 * Live buy box for the article detail page. Fetches price/availability
 * client-side (shared TanStack Query cache, ~30s stale) rather than on the
 * server, so the surrounding page stays fully cached TecDoc metadata and the
 * volatile data refreshes in place. The read fails **closed** (503), so a
 * transient stock-DB blip shows a scoped retry — the customer never sees a
 * silently wrong "unavailable". Catalog fit arrives as a prop from the cached
 * chrome, so it is not refetched here.
 */
export function ArticleBuyBox({
  articleNumber,
  fitsVehicle,
  articleName,
  vehicleName,
  onAddToCart,
}: ArticleBuyBoxProps) {
  const { data, isPending, isError, refetch } = useQuery(
    availabilityQueryOptions([articleNumber]),
  );

  if (isPending) {
    return <ArticleBuyBoxSkeleton />;
  }

  if (isError) {
    return (
      <div className="rounded-[12px] border border-line bg-bg-card p-5">
        <AvailabilityLoadError
          onRetry={() => refetch()}
          title="В момента не можем да заредим наличността."
        />
      </div>
    );
  }

  const detail = data?.[articleNumber] ?? UNAVAILABLE_DETAIL;

  return (
    <ArticleBuyBoxContent
      available={detail.available}
      priceIncVat={detail.bestPriceIncVat}
      priceExVat={detail.bestPriceExVat}
      availabilityByWarehouse={detail.availabilityByWarehouse}
      computedAt={detail.computedAt}
      fitsVehicle={fitsVehicle}
      vehicleName={vehicleName}
      articleNumber={articleNumber}
      articleName={articleName}
      onAddToCart={onAddToCart}
      onRefresh={() => refetch()}
    />
  );
}
