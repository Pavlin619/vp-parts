"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface ArticleImagesProps {
  images: string[];
  articleNumber: string;
  brandName: string;
}

function ImagePlaceholder({
  articleNumber,
  brandName,
}: {
  articleNumber: string;
  brandName: string;
}) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center"
      style={{
        background:
          "repeating-linear-gradient(135deg, transparent 0 6px, rgba(11,18,32,0.05) 6px 7px), var(--bg-sunken)",
        border: "1px solid var(--line)",
      }}
      aria-label="Без снимка"
    >
      <span className="font-mono text-[10px] uppercase text-muted">
        {brandName}
      </span>
      <span className="font-mono text-[10px] uppercase text-muted">
        {articleNumber}
      </span>
    </div>
  );
}

/**
 * Product gallery: a large main image plus a thumbnail strip. When no product
 * image is available it shows the striped placeholder — visually distinct from
 * a real product photo so the absence is unambiguous.
 */
export function ArticleImages({
  images,
  articleNumber,
  brandName,
}: ArticleImagesProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (images.length === 0) {
    return (
      <div className="relative aspect-square w-full overflow-hidden rounded-[12px]">
        <ImagePlaceholder articleNumber={articleNumber} brandName={brandName} />
      </div>
    );
  }

  const activeImage = images[activeIndex] ?? images[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-[12px] border border-line bg-bg-card">
        <Image
          src={activeImage}
          alt={`${brandName} ${articleNumber}`}
          fill
          className="object-contain"
          sizes="(max-width: 1024px) 100vw, 33vw"
          priority
        />
      </div>

      {images.length > 1 && (
        <ul className="flex gap-2" aria-label="Снимки на продукта">
          {images.map((image, index) => (
            <li key={image}>
              <button
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={`Снимка ${index + 1}`}
                aria-current={index === activeIndex ? "true" : undefined}
                className={cn(
                  "relative h-16 w-16 overflow-hidden rounded-md border bg-bg-card transition-colors",
                  index === activeIndex
                    ? "border-accent"
                    : "border-line hover:border-line-2",
                )}
              >
                <Image
                  src={image}
                  alt=""
                  fill
                  className="object-contain"
                  sizes="64px"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
