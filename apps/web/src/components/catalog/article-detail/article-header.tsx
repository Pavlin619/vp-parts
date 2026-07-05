import Image from "next/image";
import { CopyButton } from "@/components/common/copy-button";

interface ArticleHeaderProps {
  brandName: string;
  description: string;
  articleNumber: string;
  brandLogoUrl?: string | null;
}

// TODO(reviews): star rating and review count are intentionally not shown at
// launch — there is no review data yet. Add them here once a reviews feature
// exists; do not reintroduce placeholder values.

export function ArticleHeader({
  brandName,
  description,
  articleNumber,
  brandLogoUrl,
}: ArticleHeaderProps) {
  return (
    <header className="flex flex-col gap-3">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        Артикулен номер
      </span>

      <div className="flex items-center gap-3">
        <h1 className="font-display text-3xl font-semibold leading-tight text-ink">
          {articleNumber}
        </h1>

        <CopyButton value={articleNumber} label="Копирай артикулен номер" />
      </div>

      <p className="text-base leading-relaxed text-ink-2">{description}</p>

      {brandLogoUrl ? (
        <div className="relative h-10 w-32">
          <Image
            src={brandLogoUrl}
            alt={brandName}
            fill
            className="object-contain object-left"
            sizes="128px"
          />
        </div>
      ) : (
        <div
          className="flex h-14 w-40 items-center justify-center rounded-[10px] border border-line"
          style={{
            background:
              "repeating-linear-gradient(135deg, transparent 0 6px, rgba(11,18,32,0.05) 6px 7px), var(--bg-sunken)",
          }}
          aria-label={brandName}
        >
          <span className="font-mono text-xs uppercase tracking-wide text-muted">
            {brandName}
          </span>
        </div>
      )}
    </header>
  );
}
