import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import type { ArticleCatalogDetailDto } from "@vp-parts-shop/shared";
import { getArticleCatalogDetail } from "@/lib/api/catalog";
import { ApiError } from "@/lib/api";
import { decodeRouteParam } from "@/lib/utils";
import {
  ArticleImages,
  ArticleHeader,
  ArticleSpecs,
  ArticleBreadcrumbs,
  ArticleBuyBox,
  ArticleDetailSections,
} from "@/components/catalog/article-detail";

/**
 * The route carries the brand as well as the number because a TecDoc article
 * number is unique only within a data supplier — two brands can file the same
 * one, and a number-only route resolves to whichever the catalogue sorted
 * first.
 */
interface ArticleDetailPageProps {
  params: Promise<{ brandId: string; articleNumber: string }>;
  searchParams: Promise<{ vehicleId?: string; categoryId?: string }>;
}

/**
 * Catalog metadata for the page shell (images, title, specs, compatible
 * vehicles, vehicle fit). This is stable TecDoc data, so it is cached and
 * shared across requests via the `details`-only endpoint — the live
 * price/availability buy box is fetched separately and never cached. Keyed by
 * vehicleId so `fitsVehicle` stays correct per vehicle, and by brand so two
 * parts sharing a number never share a cache entry.
 */
async function fetchArticleChrome(
  brandId: string,
  articleNumber: string,
  vehicleId?: string,
): Promise<ArticleCatalogDetailDto> {
  "use cache";
  cacheLife("hours");
  cacheTag(`article-${brandId}-${articleNumber}`);

  return getArticleCatalogDetail(brandId, articleNumber, vehicleId);
}

export default async function ArticleDetailPage({
  params,
  searchParams,
}: ArticleDetailPageProps) {
  const { brandId: rawBrandId, articleNumber: rawArticleNumber } = await params;
  const brandId = decodeRouteParam(rawBrandId);
  const articleNumber = decodeRouteParam(rawArticleNumber);
  const { vehicleId, categoryId } = await searchParams;

  let article: ArticleCatalogDetailDto;
  try {
    article = await fetchArticleChrome(brandId, articleNumber, vehicleId);
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 404) {
      notFound();
    }
    throw error;
  }

  return (
    <div className="page-container py-8">
      <ArticleBreadcrumbs
        categoryPaths={article.categoryPaths}
        brandName={article.brandName}
        articleNumber={article.articleNumber}
        categoryNodeId={categoryId}
        vehicleId={vehicleId}
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)_340px] lg:gap-y-6">
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

          <ArticleSpecs technicalSpecs={article.technicalSpecs} />
        </div>

        {/* Spans both rows so the buy box — the tallest thing in the top row —
            stops deciding where the section below starts. Confined to one row it
            set that row's height, opening a gap under the shorter gallery. */}
        <aside className="h-fit lg:sticky lg:top-[calc(var(--header-height)+1rem)] lg:row-span-2">
          <ArticleBuyBox article={article} fitsVehicle={article.fitsVehicle} />
        </aside>

        {/* Stops at the buy box rather than running the page's full width.
            Anything that goes beside it later belongs inside the aside above,
            which owns this row's third column too. */}
        <div className="lg:col-span-2">
          <ArticleDetailSections
            brandId={brandId}
            articleNumber={articleNumber}
          />
        </div>
      </div>
    </div>
  );
}
