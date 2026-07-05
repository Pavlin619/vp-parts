import Image from "next/image";
import { ShoppingCart } from "lucide-react";
import type { ArticleListItemDto } from "@vp-parts-shop/shared";
import { formatPrice } from "@vp-parts-shop/shared";
import { cn } from "@/lib/utils";

interface ArticleCardProps {
  article: ArticleListItemDto;
  onAddToCart?: (articleNumber: string) => void;
}

function ArticleImage({
  thumbnailUrl,
  articleNumber,
  brandName,
}: {
  thumbnailUrl: string | null;
  articleNumber: string;
  brandName: string;
}) {
  if (thumbnailUrl) {
    return (
      <Image
        src={thumbnailUrl}
        alt={`${brandName} ${articleNumber}`}
        fill
        className="object-contain"
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
      />
    );
  }

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center"
      style={{
        background:
          "repeating-linear-gradient(135deg, transparent 0 6px, rgba(11,18,32,0.05) 6px 7px), var(--bg-sunken)",
        border: "1px solid var(--line)",
      }}
      aria-label="Без снимка"
    >
      <span className="font-mono text-[10px] uppercase text-muted">
        {brandName}
      </span>
      <span className="font-mono text-[10px] uppercase text-muted">
        {articleNumber}
      </span>
    </div>
  );
}

export function ArticleCard({ article, onAddToCart }: ArticleCardProps) {
  const {
    articleNumber,
    brandName,
    description,
    thumbnailUrl,
    available,
    bestPriceIncVat,
  } = article;

  return (
    <article className="bg-bg-card border border-line rounded-[12px] overflow-hidden flex flex-col">
      {/* Image */}
      <div className="aspect-square w-full overflow-hidden bg-bg-sunken relative">
        <ArticleImage
          thumbnailUrl={thumbnailUrl}
          articleNumber={articleNumber}
          brandName={brandName}
        />
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1 gap-2">
        {/* Brand */}
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">
          {brandName}
        </p>

        {/* Description */}
        <p className="text-sm font-medium text-ink line-clamp-2 flex-1">
          {description}
        </p>

        {/* Article number */}
        <p className="font-mono text-xs text-muted">
          Арт. № {articleNumber}
        </p>

        {/* Availability badge */}
        {available ? (
          <span
            className="inline-flex self-start items-center h-5 px-2 rounded bg-ok-soft text-ok text-[11px] font-semibold uppercase tracking-wide"
            aria-label="В наличност"
          >
            В наличност
          </span>
        ) : (
          <span
            className="inline-flex self-start items-center h-5 px-2 rounded bg-danger/10 text-danger text-[11px] font-semibold uppercase tracking-wide"
            aria-label="Временно изчерпан"
          >
            Временно изчерпан
          </span>
        )}

        {/* Price + CTA */}
        <div className="flex items-center justify-between mt-auto pt-2 border-t border-line">
          {available && bestPriceIncVat != null ? (
            <p
              className="font-display font-semibold text-ink text-base"
              style={{ fontFeatureSettings: '"tnum"' }}
              aria-label={`Цена: ${formatPrice(bestPriceIncVat)}`}
            >
              {formatPrice(bestPriceIncVat)}
            </p>
          ) : (
            <span className="text-muted text-sm">—</span>
          )}

          <button
            onClick={() => onAddToCart?.(articleNumber)}
            disabled={!available}
            className={cn(
              "flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium transition-colors",
              available
                ? "bg-accent text-white hover:bg-accent-hover"
                : "bg-bg-sunken text-muted cursor-not-allowed",
            )}
            aria-label={
              available
                ? `Добави ${description} в кошницата`
                : "Временно изчерпан"
            }
          >
            <ShoppingCart className="w-4 h-4" aria-hidden="true" />
            {available ? "Добави" : "Изчерпан"}
          </button>
        </div>
      </div>
    </article>
  );
}
