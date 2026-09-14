import Link from "next/link";
import { CopyButton } from "@/components/common/copy-button";

interface ArticleIdentityProps {
  href: string;
  articleNumber: string;
  description: string;
  /**
   * The small mono line under the description: the spec summary on a catalog
   * row, the brand on a cart line.
   */
  meta?: string;
}

/**
 * What names a part on any row: its number (copyable, and the link to the
 * detail page), its description and one line of supporting detail.
 */
export function ArticleIdentity({
  href,
  articleNumber,
  description,
  meta,
}: ArticleIdentityProps) {
  return (
    <div className="flex min-w-0 flex-col gap-[3px]">
      <div className="flex min-w-0 items-center gap-1">
        <Link
          href={href}
          className="truncate font-mono text-[14.5px] font-semibold tracking-[-0.01em] text-ink hover:underline"
        >
          {articleNumber}
        </Link>
        <CopyButton
          value={articleNumber}
          label={`Копирай номер ${articleNumber}`}
          size="sm"
          className="-my-1"
        />
      </div>

      {/* Clamped rather than wrapped freely: the row's height is pinned by the
          columns beside it, and a third description line would push past it. */}
      <p className="line-clamp-2 text-[12.5px] font-medium text-ink-2" title={description}>
        {description}
      </p>

      {meta && <p className="truncate font-mono text-[11px] text-ink-3">{meta}</p>}
    </div>
  );
}
