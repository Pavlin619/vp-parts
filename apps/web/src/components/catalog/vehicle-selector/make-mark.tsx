import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { vehicleMakeLogoSrc } from "@/lib/catalog/display/vehicle-make-mark";
import type { SelectedMake } from "./use-vehicle-selector";

interface MakeMarkProps {
  make: SelectedMake;
  sizes: string;
  /**
   * Air around the badge, which the two callers want in different amounts: a
   * tile in a grid of four gives it a couple of pixels, the preview frame a
   * whole margin. It insets the badge only — the wordmark sizes itself from the
   * box's width, so padding that would shrink the type instead of framing it.
   */
  logoInset?: string;
}

/**
 * The logo where one is bundled, otherwise the make's name set as a wordmark.
 *
 * Fills the box its parent gives it rather than declaring a ratio of its own,
 * because the grid card and the preview frame are different shapes. The mark is
 * decorative in both: each prints the make's name beside it.
 */
export function MakeMark({ make, sizes, logoInset = "p-2" }: MakeMarkProps) {
  const logoSrc = vehicleMakeLogoSrc(make.id);
  const [hasFailed, setHasFailed] = useState(false);

  return (
    <span className="relative flex h-full w-full items-center justify-center [container-type:inline-size]">
      {logoSrc && !hasFailed ? (
        <Image
          src={logoSrc}
          alt=""
          fill
          className={cn("object-contain", logoInset)}
          sizes={sizes}
          // The fetch script already writes these as WebP at the size the grid
          // tile renders, so a transform would bill a request per make to hand
          // back what it was given.
          unoptimized
          onError={() => setHasFailed(true)}
        />
      ) : (
        <MakeWordmark name={make.name} />
      )}
    </span>
  );
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

  // Sized against the box rather than the viewport, because it has several:
  // the grid is 2, 3 or 4 columns across the breakpoints and the preview frame
  // is wider than any of them. Width caps it so a long name cannot overflow,
  // line count so a multi-word one cannot overrun, and the constant so AC and
  // DR stay a mark rather than filling the box.
  const fontSize = Math.min(24, 130 / longestWord, 60 / words.length);

  return (
    <span
      aria-hidden="true"
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
  );
}
