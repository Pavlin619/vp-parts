import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import type { ArticleCatalogDetailDto } from "@vp-parts-shop/shared";
import { getArticleCatalogDetail } from "@/lib/api/catalog";
import { ApiError } from "@/lib/api";
import { decodeRouteParam } from "@/lib/utils";
import { CatalogBreadcrumbs } from "@/components/catalog/listing/catalog-breadcrumbs";
import {
  ArticleImages,
  ArticleHeader,
  ArticleSpecs,
  ArticleBuyBoxSection,
  ArticleBuyBoxSkeleton,
  ArticleTabs,
  RelatedParts,
} from "@/components/catalog/article-detail";

interface ArticleDetailPageProps {
  params: Promise<{ articleNumber: string }>;
  searchParams: Promise<{ vehicleId?: string; categoryId?: string }>;
}

/**
 * Catalog metadata for the page shell (images, title, specs, compatible
 * vehicles, vehicle fit). This is stable TecDoc data, so it is cached and
 * shared across requests via the `details`-only endpoint — the live
 * price/availability buy box is fetched separately and never cached. Keyed by
 * vehicleId so `fitsVehicle` stays correct per vehicle.
 */
async function fetchArticleChrome(
  articleNumber: string,
  vehicleId?: string,
): Promise<ArticleCatalogDetailDto> {
  "use cache";
  cacheLife("hours");
  cacheTag(`article-${articleNumber}`);

  return getArticleCatalogDetail(articleNumber, vehicleId);
}

export default async function ArticleDetailPage({
  params,
  searchParams,
}: ArticleDetailPageProps) {
  const { articleNumber: rawArticleNumber } = await params;
  const articleNumber = decodeRouteParam(rawArticleNumber);
  const { vehicleId, categoryId } = await searchParams;

  let article: ArticleCatalogDetailDto;
  try {
    article = await fetchArticleChrome(articleNumber, vehicleId);
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 404) {
      notFound();
    }
    throw error;
  }

  return (
    <div className="mx-auto max-w-[1360px] px-6 py-8">
      <CatalogBreadcrumbs />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)_340px]">
        <ArticleImages
          images={article.images}
          articleNumber={article.articleNumber}
          brandName={article.brandName}
        />

        <div className="flex flex-col gap-8">
          <ArticleHeader
            brandName={article.brandName}
            description={article.description}
            articleNumber={article.articleNumber}
            brandLogoUrl={article.brandLogoUrl}
          />

          <ArticleSpecs
            technicalSpecs={article.technicalSpecs}
            oemNumbers={article.oemNumbers}
          />
        </div>

        <aside className="h-fit lg:sticky lg:top-4">
          <Suspense fallback={<ArticleBuyBoxSkeleton />}>
            <ArticleBuyBoxSection
              articleNumber={articleNumber}
              fitsVehicle={article.fitsVehicle}
              articleName={article.description}
            />
          </Suspense>
        </aside>
      </div>

      <div className="mt-12">
        <ArticleTabs compatibleVehicles={article.compatibleVehicles} />
      </div>

      <div className="mt-12">
        <RelatedParts
          currentArticleNumber={article.articleNumber}
          vehicleId={vehicleId}
          categoryId={categoryId}
        />
      </div>
    </div>
  );
}
