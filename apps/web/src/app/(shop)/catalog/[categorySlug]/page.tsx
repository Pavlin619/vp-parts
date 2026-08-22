import { cacheLife, cacheTag } from "next/cache";
import { CatalogBreadcrumbs } from "@/components/catalog/listing/catalog-breadcrumbs";
import { ArticleGridAvailability } from "@/components/catalog/listing/article-grid-availability";
import { CatalogPagination } from "@/components/catalog/listing/catalog-pagination";
import { getArticlesMetadata } from "@/lib/api/catalog";
import type { PaginatedCatalogArticlesDto } from "@vp-parts-shop/shared";

interface CategoryPageProps {
  params: Promise<{ categorySlug: string }>;
  searchParams: Promise<{
    vehicleId?: string;
    page?: string;
    pageSize?: string;
  }>;
}

/**
 * Cached TecDoc catalog metadata for the grid. Availability is deliberately not
 * fetched here: it is read live and separately (see {@link ArticleGridAvailability})
 * so this cached payload never carries a stale delivery date.
 */
async function fetchArticlesMetadata(
  vehicleId: string,
  categoryId: string,
  page: number,
  pageSize: number,
): Promise<PaginatedCatalogArticlesDto> {
  "use cache";
  cacheLife("hours");
  cacheTag(`articles-${vehicleId}-${categoryId}`);
  return getArticlesMetadata(vehicleId, categoryId, page, pageSize);
}

export default async function CategoryPage({
  params,
  searchParams,
}: CategoryPageProps) {
  const { categorySlug } = await params;
  const { vehicleId, page: pageParam, pageSize: pageSizeParam } =
    await searchParams;

  const page = Math.max(1, Number(pageParam ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(pageSizeParam ?? 20)));

  if (!vehicleId) {
    return (
      <div className="page-container py-12 text-center">
        <p className="text-muted">
          Изберете автомобил, за да видите съвместимите части.
        </p>
      </div>
    );
  }

  const metadata = await fetchArticlesMetadata(
    vehicleId,
    categorySlug,
    page,
    pageSize,
  );

  return (
    <div className="page-container py-8">
      <CatalogBreadcrumbs />
      <ArticleGridAvailability metadata={metadata} />
      <CatalogPagination
        page={page}
        pageSize={pageSize}
        total={metadata.total}
        vehicleId={vehicleId}
      />
    </div>
  );
}
