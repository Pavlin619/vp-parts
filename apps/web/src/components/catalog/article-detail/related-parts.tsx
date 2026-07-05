import Link from "next/link";
import type { ArticleListItemDto } from "@vp-parts-shop/shared";
import { formatPrice } from "@vp-parts-shop/shared";
import { listArticles } from "@/lib/api/catalog";

interface RelatedPartsProps {
  currentArticleNumber: string;
  vehicleId?: string;
  categoryId?: string;
  limit?: number;
}

/**
 * Picks the related articles to display: same category + vehicle, excluding the
 * article currently being viewed, capped at `limit`. Pure so it can be unit
 * tested without rendering the async Server Component.
 */
export function selectRelatedArticles(
  articles: ArticleListItemDto[],
  currentArticleNumber: string,
  limit = 4,
): ArticleListItemDto[] {
  return articles
    .filter((article) => article.articleNumber !== currentArticleNumber)
    .slice(0, limit);
}

/**
 * Server Component. Related parts only make sense once we know both the vehicle
 * and the assembly group the user came from, so it renders nothing when either
 * is missing.
 */
export async function RelatedParts({
  currentArticleNumber,
  vehicleId,
  categoryId,
  limit = 4,
}: RelatedPartsProps) {
  if (!vehicleId || !categoryId) {
    return null;
  }

  const data = await listArticles(vehicleId, categoryId, 1, limit + 1);
  const related = selectRelatedArticles(data.items, currentArticleNumber, limit);

  if (related.length === 0) {
    return null;
  }

  return (
    <section aria-label="Свързани части">
      <h2 className="mb-3 text-sm font-semibold text-ink">Свързани части</h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {related.map((article) => (
          <li key={article.articleNumber}>
            <Link
              href={`/catalog/articles/${encodeURIComponent(article.articleNumber)}`}
              className="flex h-full flex-col gap-1 rounded-[12px] border border-line bg-bg-card p-3 transition-colors hover:border-ink"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                {article.brandName}
              </span>
              <span className="line-clamp-2 text-sm font-medium text-ink">
                {article.description}
              </span>
              <span className="font-mono text-xs text-muted">
                {article.articleNumber}
              </span>
              <span className="mt-auto pt-1 font-display text-sm font-semibold tabular-nums text-ink">
                {article.available && article.bestPriceIncVat != null
                  ? formatPrice(article.bestPriceIncVat)
                  : "—"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
