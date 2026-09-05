import { useState } from "react";
import Image from "next/image";
import type { ManufacturerDto } from "@vp-parts-shop/shared";
import { vehicleMakeLogoSrc } from "@/lib/catalog/vehicle-make-mark";

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
        has scrolled has nothing on screen saying which half they are in. The
        panel's own background is what the cards pass behind; the negative
        margin widens it past the cards' focus ring, which is drawn 3px outside
        the border and would otherwise clip through.
      */}
      <h3 className="sticky top-0 z-10 -mx-1 bg-bg-card px-1 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted">
        {label}
      </h3>
      <ul
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
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
      <MakeMark make={make} />
      <span className="w-full truncate text-center text-[13px] font-semibold text-ink">
        {make.name}
      </span>
    </button>
  );
}

/**
 * The logo where one is bundled, otherwise the make's name set as a wordmark.
 * The name is rendered directly below either way, so the mark is decorative and
 * stays out of the accessibility tree.
 */
function MakeMark({ make }: { make: ManufacturerDto }) {
  const logoSrc = vehicleMakeLogoSrc(make.id);
  const [hasFailed, setHasFailed] = useState(false);

  if (logoSrc && !hasFailed) {
    return (
      // No background of its own: a badge is drawn for white, and the card
      // already is white. The box is still reserved so a make with a wide mark
      // and one with a tall mark leave their cards the same height.
      <span className="relative flex aspect-[4/3] w-full items-center justify-center">
        <Image
          src={logoSrc}
          alt=""
          fill
          className="object-contain p-2"
          sizes="160px"
          // The fetch script already writes these as WebP at the size this tile
          // renders, so a transform would bill a request per make to hand back
          // what it was given.
          unoptimized
          onError={() => setHasFailed(true)}
        />
      </span>
    );
  }

  return <MakeWordmark name={make.name} />;
}

/**
 * One line per word, so a two-word make reads as a stacked mark rather than as
 * a shrunk-to-fit string. A short name is left whole: splitting it buys no size
 * — it already fits on one line — and costs legibility, since B-ON and ICH-X
 * break into a stack of stubs.
 */
function wordmarkLines(name: string): string[] {
  if (name.length <= 8) return [name];

  return name.split(/[\s-]+/).filter(Boolean);
}

/**
 * A make with no bundled badge, set as its own name.
 *
 * This replaced two initials on a striped grey tile, which collided for
 * alphabetical neighbours — CALLAWAY, CARBODIES, CASALINI and CAVAN were four
 * identical "CA" tiles in a row — and read as a failed image next to the real
 * badges. A wordmark is not a stand-in for a logo here: 64 of the bundled
 * badges *are* the make's name set as type (BEDFORD, TOFAŞ, IRMSCHER, BAW), so
 * this renders as one more of those rather than as a gap in the grid.
 */
function MakeWordmark({ name }: { name: string }) {
  const words = wordmarkLines(name);
  const longestWord = Math.max(...words.map((word) => word.length));

  // Sized against the tile rather than the viewport, because the grid is 2, 3
  // or 4 columns across the breakpoints and a fixed size fits none of them:
  // width caps it so a long name cannot overflow, line count so a multi-word
  // one cannot overrun the tile, and the constant so AC and DR stay a mark
  // rather than filling the card.
  const fontSize = Math.min(24, 130 / longestWord, 60 / words.length);

  return (
    <span
      aria-hidden="true"
      className="flex aspect-[4/3] w-full items-center justify-center [container-type:inline-size]"
    >
      <span
        data-testid="make-wordmark"
        // Weight 600 rather than bold: the display face is loaded at 400/500/600,
        // so `font-bold` would leave the browser to synthesise 700.
        className="flex flex-col items-center font-display font-semibold leading-[1.1] tracking-tight text-ink-2"
        style={{ fontSize: `${fontSize}cqw` }}
      >
        {words.map((word, index) => (
          <span key={`${word}-${index}`}>{word}</span>
        ))}
      </span>
    </span>
  );
}
