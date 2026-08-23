import Link from "next/link";
import type { ReactNode } from "react";
import {
  buildSearchUrl,
  withPage,
  type SearchUrlState,
} from "@/lib/catalog/search-url";

interface SearchPageStepProps {
  state: SearchUrlState;
  page: number;
  isDisabled: boolean;
  /** Accessible name — the compact pager's steps carry no visible text. */
  label: string;
  className: string;
  children: ReactNode;
}

/**
 * One "previous"/"next" step, shared by both pagers on the search page.
 *
 * A step that leads nowhere is rendered as inert text rather than a link, so it
 * cannot be focused or followed by keyboard. Keeping that here is what stops the
 * two pagers drifting apart on it.
 */
export function SearchPageStep({
  state,
  page,
  isDisabled,
  label,
  className,
  children,
}: SearchPageStepProps) {
  if (isDisabled) {
    return (
      <span aria-hidden="true" className={className}>
        {children}
      </span>
    );
  }

  return (
    <Link
      href={buildSearchUrl(withPage(state, page))}
      prefetch={false}
      aria-label={label}
      className={className}
    >
      {children}
    </Link>
  );
}
