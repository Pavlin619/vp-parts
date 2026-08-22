import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { BreadcrumbItem } from "@/lib/breadcrumbs";

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

/**
 * A navigation trail. A crumb without an `href` is the page already on screen
 * and renders as text; the builder that produced the items decides which one
 * that is.
 */
export function Breadcrumbs({ items }: BreadcrumbsProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Навигационна пътека" className="mb-6">
      <ol className="flex flex-wrap items-center gap-1.5 text-[13px]">
        {items.map((item, index) => (
          <li key={item.key} className="flex items-center gap-1.5">
            {index > 0 && (
              <ChevronRight
                className="h-3.5 w-3.5 shrink-0 text-ink-4"
                aria-hidden="true"
              />
            )}

            {item.href ? (
              <Link
                href={item.href}
                prefetch={false}
                className="text-ink-3 transition-colors hover:text-ink"
              >
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-ink">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
