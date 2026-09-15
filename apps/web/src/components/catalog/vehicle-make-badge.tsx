"use client";

import { useState } from "react";
import Image from "next/image";
import { Car } from "lucide-react";
import { vehicleMakeLogoSrc } from "@/lib/catalog/display/vehicle-make-mark";
import { cn } from "@/lib/utils";

/** The largest tile any caller renders, for the source-set hint. */
const BADGE_SIZES = "36px";

interface VehicleMakeBadgeProps {
  /** Null where the vehicle is known only by an id from someone else's link. */
  manufacturerId: string | null;
  /** The tile's size and corner, which differ per surface. */
  className?: string;
}

/**
 * The marque's badge at icon size, for the slots that name a vehicle in a line
 * of text rather than picture it.
 *
 * It falls back to the generic car glyph where `MakeMark` falls back to a
 * wordmark, and that is the whole difference between them: the wordmark sizes
 * itself in container units, so in a 36px tile `STANDARD AUTOMOBILE` resolves to
 * under 5px. The glyph is what these slots showed before a badge was available,
 * and 57 of the 286 selectable makes still show it.
 *
 * The tile is white for the reason the selector's cards are — 28 of the bundled
 * badges are opaque rather than transparent, so a tinted tile prints a white
 * panel inside itself.
 */
export function VehicleMakeBadge({ manufacturerId, className }: VehicleMakeBadgeProps) {
  // Remembering *which* file failed rather than a boolean is what lets the next
  // make try again: the flag clears itself when the source changes.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const bundledSrc = manufacturerId ? vehicleMakeLogoSrc(manufacturerId) : null;
  const logoSrc = bundledSrc === failedSrc ? null : bundledSrc;

  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden bg-white",
        className,
      )}
    >
      {logoSrc ? (
        <Image
          src={logoSrc}
          alt=""
          fill
          sizes={BADGE_SIZES}
          className="object-contain p-1"
          // The fetch script already writes these as WebP at tile size, so a
          // transform would bill a request per make to hand back what it was
          // given.
          unoptimized
          onError={() => setFailedSrc(logoSrc)}
        />
      ) : (
        <Car className="h-4 w-4 text-ink-3" aria-hidden="true" />
      )}
    </span>
  );
}
