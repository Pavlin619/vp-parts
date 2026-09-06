import type { ManufacturerDto } from "@vp-parts-shop/shared";
import { MakeMark } from "./make-mark";

interface ManufacturerGridProps {
  manufacturers: ManufacturerDto[];
  isFiltered: boolean;
  onSelect: (make: ManufacturerDto) => void;
}

/**
 * The brand step: makes as logo-and-name cards.
 *
 * Grouped into popular and the rest while browsing, because the full list is
 * 286 makes and the twenty a visitor is likely to want are scattered through
 * it. A search collapses the grouping into one grid — a query matching a single
 * popular make would otherwise render a "ПОПУЛЯРНИ" heading over one card and
 * an empty section below it.
 */
export function ManufacturerGrid({
  manufacturers,
  isFiltered,
  onSelect,
}: ManufacturerGridProps) {
  if (isFiltered) {
    return <ManufacturerCards makes={manufacturers} label="Марки" onSelect={onSelect} />;
  }

  const popular = manufacturers.filter((make) => make.isPopular);
  const rest = manufacturers.filter((make) => !make.isPopular);

  return (
    <div className="flex flex-col">
      {popular.length > 0 && (
        <ManufacturerCards makes={popular} label="Популярни" onSelect={onSelect} />
      )}
      {rest.length > 0 && <ManufacturerCards makes={rest} label="A–Z" onSelect={onSelect} />}
    </div>
  );
}

function ManufacturerCards({
  makes,
  label,
  onSelect,
}: {
  makes: ManufacturerDto[];
  label: string;
  onSelect: (make: ManufacturerDto) => void;
}) {
  return (
    // The gap between sections belongs to the section above rather than to a
    // `gap` on the parent, so that a heading stays pinned right up to the point
    // the next one arrives to push it out. On a parent gap both sections' blocks
    // end early and the strip is briefly unlabelled mid-scroll.
    <section className="flex flex-col pb-5 last:pb-0">
      {/*
        Pinned because the A–Z run is 251 makes deep: without it a visitor who
        has scrolled has nothing on screen saying which half they are in. Drawn
        as a band across the whole panel rather than a line of text over the
        cards — the negative margin cancels the scrolling panel's padding, which
        the inner padding then puts back so the label still starts where the
        cards do. The fill has to be opaque: the cards pass behind it.
      */}
      <h3 className="sticky top-0 z-10 -mx-5 border-t border-line bg-canvas px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
        {label}
      </h3>
      <ul
        className="grid grid-cols-2 gap-2 pt-3 sm:grid-cols-3 lg:grid-cols-4"
        aria-label={label}
      >
        {makes.map((make) => (
          <li key={make.id}>
            <ManufacturerCard make={make} onSelect={onSelect} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ManufacturerCard({
  make,
  onSelect,
}: {
  make: ManufacturerDto;
  onSelect: (make: ManufacturerDto) => void;
}) {
  return (
    // Hover moves the border and lifts the card rather than filling it. Every
    // mark is transparent, so a fill would put its own colour behind the badge
    // on the one interaction that draws attention to it.
    <button
      onClick={() => onSelect(make)}
      className="flex w-full flex-col items-center gap-2 rounded-xl border border-line bg-bg-card p-2.5 transition-[border-color,box-shadow] hover:border-ink-2 hover:shadow-[0_2px_10px_rgba(11,18,32,0.08)] focus:outline-none focus-visible:border-ink focus-visible:shadow-[0_0_0_3px_rgba(11,18,32,0.06)]"
    >
      {/* The box is reserved here so a make with a wide mark and one with a tall
          mark leave their cards the same height. */}
      <span className="flex aspect-[4/3] w-full">
        <MakeMark make={make} sizes="160px" />
      </span>
      <span className="w-full truncate text-center text-[13px] font-semibold text-ink">
        {make.name}
      </span>
    </button>
  );
}
