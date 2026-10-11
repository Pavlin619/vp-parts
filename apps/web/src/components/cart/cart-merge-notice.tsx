"use client";

import { Info, X } from "lucide-react";
import { MAX_CART_LINES } from "@vp-parts-shop/shared";
import { useCart } from "@/hooks/use-cart";

/**
 * Names the parts a sign-in could not carry over into the account's cart,
 * because the two carts together held more lines than one cart may.
 */
export function CartMergeNotice() {
  const droppedLines = useCart((state) => state.droppedLines);
  const dismiss = useCart((state) => state.dismissDroppedLines);

  if (droppedLines.length === 0) {
    return null;
  }

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-2.5 rounded-[12px] border border-line bg-bg-sunken px-4 py-3 text-[12.5px] leading-[1.45] text-ink-2"
    >
      <Info className="mt-px h-4 w-4 shrink-0 text-ink-4" aria-hidden="true" />

      <div className="flex-1">
        <p>
          Не успяхме да прехвърлим тези артикули — кошницата побира до{" "}
          {MAX_CART_LINES} различни артикула:
        </p>
        <ul className="mt-1.5 list-disc pl-4 font-mono text-[12px]">
          {droppedLines.map((line) => (
            <li key={`${line.brandId}-${line.articleNumber}`}>
              {[line.brandName, line.articleNumber].filter(Boolean).join(" ")}
            </li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Затвори"
        className="shrink-0 rounded-md p-0.5 text-ink-4 transition-colors hover:text-ink"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
