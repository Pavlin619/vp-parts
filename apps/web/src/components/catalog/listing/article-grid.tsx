import type { ArticleListItemDto } from "@vp-parts-shop/shared";
import { ArticleCard } from "./article-card";

interface ArticleGridProps {
  articles: ArticleListItemDto[];
  total: number;
}

export function ArticleGrid({ articles, total }: ArticleGridProps) {
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-muted">{total} резултата</p>
      </div>

      {articles.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted">Няма намерени части в тази категория.</p>
        </div>
      ) : (
        <ul
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
          aria-label="Списък с части"
        >
          {articles.map((article) => (
            <li key={article.articleNumber}>
              <ArticleCard article={article} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
