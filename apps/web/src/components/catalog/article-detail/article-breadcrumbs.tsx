import type { ArticleCategoryNodeDto } from "@vp-parts-shop/shared";
import { Breadcrumbs } from "@/components/common/breadcrumbs";
import { buildArticleBreadcrumbs } from "@/lib/catalog/article-breadcrumbs";

interface ArticleBreadcrumbsProps {
  categoryPaths: ArticleCategoryNodeDto[][];
  brandName: string;
  articleNumber: string;
  categoryNodeId?: string;
  vehicleId?: string;
}

/** Where the part sits in the category tree, above the detail layout. */
export function ArticleBreadcrumbs(props: ArticleBreadcrumbsProps) {
  return <Breadcrumbs items={buildArticleBreadcrumbs(props)} />;
}
