import type { ReactNode } from "react";
import Link from "next/link";

interface FilterBlockProps {
  title: string;
  /** Rendered as a "clear" action only when the block has an active selection. */
  clearHref?: string;
  children: ReactNode;
}

/** The card shell every sidebar filter group shares. */
export function FilterBlock({ title, clearHref, children }: FilterBlockProps) {
  return (
    <section className="rounded-md border border-line bg-bg-card p-4">
      <div className="mb-3.5 flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
        {clearHref && (
          <Link
            href={clearHref}
            prefetch={false}
            className="text-xs text-ink-3 transition-colors hover:text-brand"
          >
            Изчисти
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
