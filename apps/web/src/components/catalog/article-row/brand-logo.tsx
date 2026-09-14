"use client";

import { useState } from "react";
import Image from "next/image";
import { Tooltip } from "@/components/common/tooltip";

interface BrandLogoProps {
  brandName: string;
  brandLogoUrl: string | null;
}

/**
 * The brand cell. A logo that fails to load is treated as no logo at all — the
 * wordmark fallback says more than an empty frame, and a TecDoc image host we
 * have not registered in `next.config.ts` fails exactly this way.
 *
 * The logo carries the brand name in a tooltip: a mark alone is not a name, and
 * the row has no room to print one beside it.
 */
export function BrandLogo({ brandName, brandLogoUrl }: BrandLogoProps) {
  const [hasFailed, setHasFailed] = useState(false);

  if (brandLogoUrl && !hasFailed) {
    return (
      <Tooltip label={brandName}>
        <span className="relative block h-[34px] w-[56px] rounded-md border border-line bg-bg-card @row-split:h-[42px] @row-split:w-[68px]">
          <Image
            src={brandLogoUrl}
            alt={brandName}
            fill
            className="object-contain p-1"
            sizes="68px"
            onError={() => setHasFailed(true)}
          />
        </span>
      </Tooltip>
    );
  }

  // No tooltip on the wordmark: it already prints the name the tooltip would
  // repeat.

  return (
    <span className="grid h-[34px] w-[56px] place-items-center break-words rounded-md border border-line bg-bg-card px-[5px] py-[3px] text-center font-display text-[10.5px] font-bold leading-[1.1] tracking-[0.02em] text-ink-2 @row-split:h-[42px] @row-split:w-[68px]">
      {brandName}
    </span>
  );
}
