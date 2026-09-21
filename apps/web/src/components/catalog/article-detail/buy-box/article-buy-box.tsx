"use client";

import { useQuery } from "@tanstack/react-query";
import { articleIdentityKey } from "@vp-parts-shop/shared";
import { useAddToCart } from "@/hooks/use-add-to-cart";
import { useCanAddLine, type CartLineArticle } from "@/hooks/use-cart";
import { availabilityQueryOptions } from "@/lib/api/catalog";
import { UNAVAILABLE_DETAIL } from "@/lib/inventory/merge-availability";
import { AvailabilityLoadError } from "@/components/catalog/availability-load-error";
import { ArticleBuyBoxContent } from "./article-buy-box-content";
import { ArticleBuyBoxSkeleton } from "./article-buy-box-skeleton";

interface ArticleBuyBoxProps {
  /**
   * The part, as the cart stores it. The brand travels with the number because
   * a number alone names as many parts as there are suppliers filing it, and
   * the rest is what a cart line renders from — the cart is built here, from
   * the page's own catalog read, so it never has to fetch the part again.
   */
  article: CartLineArticle;
  /** Server-driven vehicle fit, passed from the cached catalog chrome. */
  fitsVehicle: boolean | null;
  vehicleName?: string;
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
  article,
  fitsVehicle,
  vehicleName,
}: ArticleBuyBoxProps) {
  const { brandId, articleNumber } = article;
  const { addToCart, isAddingToCart } = useAddToCart();
  const canAddToCart = useCanAddLine(article);

  const { data, isPending, isError, refetch } = useQuery(
    availabilityQueryOptions([{ brandId, articleNumber }]),
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

  const detail =
    data?.[articleIdentityKey(brandId, articleNumber)] ?? UNAVAILABLE_DETAIL;

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
      articleName={article.description}
      canAddToCart={canAddToCart}
      isAddingToCart={isAddingToCart}
      onAddToCart={(quantity) =>
        addToCart(article, quantity, detail.bestPriceIncVat)
      }
      onRefresh={() => refetch()}
    />
  );
}
