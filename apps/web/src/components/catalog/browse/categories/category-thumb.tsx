import Image from "next/image";
import { Boxes } from "lucide-react";
import { categoryIllustrationSrc } from "@/lib/catalog/display/category-illustration";
import { cn } from "@/lib/utils";

/** The widest a card gets across the four-, three- and two-column layouts. */
const THUMB_SIZES = "(max-width: 680px) 45vw, (max-width: 1000px) 30vw, 300px";

interface CategoryThumbProps {
  categoryId: string;
  className?: string;
  /** Override for a grid whose columns are not the catalogue's own. */
  sizes?: string;
}

/**
 * A category's illustration, or the neutral tile for a root without one. TecDoc
 * files no image for a category — not even a near-miss to reject — so all 36 are
 * ours to ship; see `category-illustration.ts`.
 */
export function CategoryThumb({
  categoryId,
  className,
  sizes = THUMB_SIZES,
}: CategoryThumbProps) {
  const illustrationSrc = categoryIllustrationSrc(categoryId);

  return (
    <span
      className={cn(
        "relative flex items-center justify-center overflow-hidden bg-bg-sunken",
        !illustrationSrc && "hatched",
        className,
      )}
    >
      {illustrationSrc ? (
        <Image
          src={illustrationSrc}
          alt=""
          fill
          sizes={sizes}
          className="object-cover"
        />
      ) : (
        <Boxes className="h-7 w-7 text-ink-4" aria-hidden="true" />
      )}
    </span>
  );
}
