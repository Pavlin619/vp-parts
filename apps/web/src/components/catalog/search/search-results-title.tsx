interface SearchResultsTitleProps {
  /** The term as typed. Never empty — an empty query has its own page. */
  query: string;
}

/**
 * The term the results answer, above the controls that narrow them.
 *
 * Every filter is a navigation and the search box lives in the site header, so
 * without this a visitor several narrowings down a scrolled page has nothing on
 * screen saying what was searched for. The breadcrumbs are not that: they carry
 * the position in the category tree and deliberately leave the term out.
 *
 * Inline rather than a flex row — two sizes on a shared baseline is what inline
 * text does by default, and it keeps the space between label and term in the
 * text a screen reader reads out.
 */
export function SearchResultsTitle({ query }: SearchResultsTitleProps) {
  return (
    <h1 className="mb-2.5 break-words leading-tight">
      <span className="text-[12.5px] font-medium text-ink-4">
        Резултати за
      </span>{" "}
      <span className="font-display text-[17px] font-semibold tracking-[-0.01em] text-ink">
        „{query}“
      </span>
    </h1>
  );
}
