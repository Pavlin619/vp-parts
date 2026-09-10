interface SearchResultsTitleProps {
  /** The term as typed. Empty on a category browse, which types nothing. */
  query: string;
  /**
   * The category the results are narrowed to, used as the subject when nothing
   * was typed. Absent where the catalogue could not name the node.
   */
  categoryLabel?: string;
}

/**
 * What the results answer, above the controls that narrow them.
 *
 * Every filter is a navigation and the search box lives in the site header, so
 * without this a visitor several narrowings down a scrolled page has nothing on
 * screen saying what is being shown. The breadcrumbs are not that: they carry
 * the position in the category tree and deliberately leave the subject out.
 *
 * A category browse arrives here with nothing typed — the catalogue links to
 * `/search` with a car and a category — so the subject is the category instead
 * of the term. Without that this printed an empty pair of quotes.
 *
 * Inline rather than a flex row — two sizes on a shared baseline is what inline
 * text does by default, and it keeps the space between label and subject in the
 * text a screen reader reads out.
 */
export function SearchResultsTitle({ query, categoryLabel }: SearchResultsTitleProps) {
  const { label, subject } = titleParts(query, categoryLabel);

  return (
    <h1 className="mb-2.5 break-words leading-tight">
      <span className="text-[12.5px] font-medium text-ink-4">{label}</span>
      {subject && (
        <>
          {" "}
          <span className="font-display text-[17px] font-semibold tracking-[-0.01em] text-ink">
            „{subject}“
          </span>
        </>
      )}
    </h1>
  );
}

/**
 * A browse with neither a term nor a nameable category keeps the label and drops
 * the quotes — the vehicle alone is a subject the breadcrumbs cannot show and
 * empty quotes would read as a term that failed to load.
 */
function titleParts(
  query: string,
  categoryLabel: string | undefined,
): { label: string; subject?: string } {
  if (query) {
    return { label: "Резултати за", subject: query };
  }

  return categoryLabel
    ? { label: "Всички части в", subject: categoryLabel }
    : { label: "Всички части" };
}
