import { cacheLife, cacheTag } from "next/cache";
import { CatalogBreadcrumbs } from "@/components/catalog/catalog-breadcrumbs";
import { ArticleGrid } from "@/components/catalog/article-grid";
import { CatalogPagination } from "@/components/catalog/catalog-pagination";
import { listArticles } from "@/lib/api/catalog";
import type { PaginatedArticlesDto } from "@vp-parts-shop/shared";

interface CategoryPageProps {
  params: Promise<{ categorySlug: string }>;
  searchParams: Promise<{
    vehicleId?: string;
    page?: string;
    pageSize?: string;
  }>;
}

async function fetchArticles(
  vehicleId: string,
  categoryId: string,
  page: number,
  pageSize: number,
): Promise<PaginatedArticlesDto> {
  "use cache";
  cacheLife("hours");
  cacheTag(`articles-${vehicleId}-${categoryId}`);
  return listArticles(vehicleId, categoryId, page, pageSize);
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
      <div className="max-w-[1360px] mx-auto px-6 py-12 text-center">
        <p className="text-muted">
          Изберете автомобил, за да видите съвместимите части.
        </p>
      </div>
    );
  }

  const data = await fetchArticles(vehicleId, categorySlug, page, pageSize);

  return (
    <div className="max-w-[1360px] mx-auto px-6 py-8">
      <CatalogBreadcrumbs />
      <ArticleGrid articles={data.items} total={data.total} />
      <CatalogPagination
        page={page}
        pageSize={pageSize}
        total={data.total}
        vehicleId={vehicleId}
      />
    </div>
  );
}
