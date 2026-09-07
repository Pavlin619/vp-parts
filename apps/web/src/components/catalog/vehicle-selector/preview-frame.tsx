import { useState, type ReactNode } from "react";
import Image from "next/image";
import {
  SERIES_PHOTO_HEIGHT,
  SERIES_PHOTO_WIDTH,
} from "@/lib/catalog/vehicle-series-photo";
import { cn } from "@/lib/utils";
import { MakeMark } from "./make-mark";
import type { SelectedMake, SelectedSeries } from "./use-vehicle-selector";

/**
 * The two boxes the picture is drawn in: a column of its own where there is
 * room for one, and a thumbnail beside the text in the strip a narrow screen
 * gets instead. The widths carry the badge's source-set hint with them.
 */
const FRAME_SIZES = {
  full: { box: "w-full", markSizes: "248px", markInset: "p-6" },
  compact: { box: "w-24 flex-shrink-0", markSizes: "96px", markInset: "p-1.5" },
} as const;

interface PreviewFrameProps {
  selectedMake: SelectedMake | null;
  selectedSeries: SelectedSeries | null;
  seriesPhotoUrl: string | null;
  size: keyof typeof FRAME_SIZES;
}

/**
 * The most specific picture available: the series photo, else the make's badge,
 * else a hatched panel.
 *
 * A photo whose signed token has died falls back to the badge rather than to the
 * panel — the make is still known, so there is still something true to show.
 */
export function PreviewFrame({
  selectedMake,
  selectedSeries,
  seriesPhotoUrl,
  size,
}: PreviewFrameProps) {
  // Remembering *which* URL failed rather than a boolean is what lets the next
  // model try again: the flag clears itself when the URL changes, with no
  // effect to keep in sync.
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null);
  const photoUrl = seriesPhotoUrl === failedPhotoUrl ? null : seriesPhotoUrl;
  const { box, markSizes, markInset } = FRAME_SIZES[size];

  if (photoUrl) {
    const photoLabel = [selectedMake?.name, selectedSeries?.name]
      .filter(Boolean)
      .join(" ");

    return (
      // The asset's background is baked white, so the frame behind it has to be
      // white too — on the sunken surface it drew as a white box inside a beige
      // one. It is 800x287 against a taller frame, which leaves it centred with
      // white above and below rather than filling the box; the frame has to fit
      // a badge as well, and a badge is nowhere near that wide.
      <Frame className={cn(box, "bg-white")}>
        <Image
          src={photoUrl}
          alt={photoLabel}
          width={SERIES_PHOTO_WIDTH}
          height={SERIES_PHOTO_HEIGHT}
          // TecDoc already serves this pre-sized and compressed, so the
          // optimizer would only re-encode it — and it could not cache the
          // result anyway, since the URL carries a token minted per response.
          unoptimized
          // The URL is a signed token cached for hours, so it can be dead by
          // the time a browser asks for it. That has to cost the badge rather
          // than the browser's broken-image icon.
          onError={() => setFailedPhotoUrl(photoUrl)}
          className="w-full h-auto"
        />
      </Frame>
    );
  }

  if (selectedMake) {
    // White for the same reason the grid cards are: these are photographic
    // marks drawn for white, 28 of them opaque rather than transparent.
    return (
      <Frame className={cn(box, "bg-white")}>
        <MakeMark make={selectedMake} sizes={markSizes} logoInset={markInset} />
      </Frame>
    );
  }

  return (
    <Frame className={cn(box, "hatched bg-bg-sunken")}>
      <span className="text-[10px] font-semibold text-muted uppercase tracking-widest">
        Лого · фото на модел
      </span>
    </Frame>
  );
}

/**
 * One ratio for all three states, so the panel does not resize under the visitor
 * when a make is picked or a photo arrives.
 */
function Frame({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "aspect-[16/9] rounded-xl border border-line flex items-center",
        "justify-center flex-shrink-0 overflow-hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}
