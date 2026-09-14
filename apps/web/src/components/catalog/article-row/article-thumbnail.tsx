"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface ArticleThumbnailProps {
  href: string;
  thumbnailUrl: string | null;
}

/**
 * A row's part photo, in a square slot every row surface shares.
 *
 * Supplier photos are almost never square — the tall ones are filters, the wide
 * ones brake discs — so `object-contain` letterboxes most of them rather than
 * crop a part a mechanic is trying to recognise. That makes the slot's own
 * backdrop visible down the sides of the image, which is why it is the card
 * colour behind a photo and framed like the cells beside it: TecDoc images are
 * white-backed, so they read edge to edge instead of sitting in grey bands.
 * The sunken fill belongs to the empty state, where there is nothing to
 * letterbox.
 */
export function ArticleThumbnail({ href, thumbnailUrl }: ArticleThumbnailProps) {
  const [hasFailed, setHasFailed] = useState(false);
  const photoUrl = hasFailed ? null : thumbnailUrl;

  return (
    <Link
      href={href}
      // The article number next to it is the accessible link to the same page;
      // this one is decorative, so keep it out of the tab order.
      tabIndex={-1}
      aria-hidden="true"
      data-testid="article-row-thumbnail"
      className={cn(
        "relative block h-11 w-11 shrink-0 overflow-hidden rounded-md",
        photoUrl ? "border border-line bg-bg-card" : "bg-bg-sunken",
      )}
    >
      {photoUrl ? (
        <Image
          src={photoUrl}
          alt=""
          fill
          className="object-contain"
          sizes="44px"
          onError={() => setHasFailed(true)}
        />
      ) : (
        // The brand is printed in the cell beside it, so the placeholder stays
        // wordless rather than saying the brand name twice.
        <span className="grid h-full w-full place-items-center text-ink-4">
          <ImageOff className="h-4 w-4" aria-hidden="true" />
        </span>
      )}
    </Link>
  );
}
