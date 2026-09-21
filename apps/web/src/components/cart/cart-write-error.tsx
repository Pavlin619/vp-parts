"use client";

import { TriangleAlert, X } from "lucide-react";
import { useCart, type CartWriteErrorCode } from "@/hooks/use-cart";

const MESSAGES: Record<CartWriteErrorCode, string> = {
  CART_FULL: "Кошницата е пълна — този артикул не беше добавен.",
  CART_ITEM_NOT_FOUND: "Артикулът вече не е в кошницата — списъкът е обновен.",
  OFFLINE: "Промяната не бе запазена. Проверете връзката си.",
  SYNC_FAILED:
    "Кошницата не можа да се синхронизира. Показваме последното запазено състояние.",
};

/**
 * Says a cart write did not land, once — for the two rejections a write can
 * get back from the server ({@link CartWriteErrorCode}) and for one it never
 * heard back from at all.
 *
 * Reads {@link CartState.lastWriteError} directly rather than taking it as a
 * prop: every cart surface (drawer, page) wants the same banner wired to the
 * same store field, so there is nothing for a parent to thread through.
 */
export function CartWriteErrorBanner() {
  const error = useCart((state) => state.lastWriteError);
  const dismiss = useCart((state) => state.dismissWriteError);

  if (!error) {
    return null;
  }

  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-2.5 rounded-[12px] border border-danger/20 bg-danger/8 px-4 py-3 text-[12.5px] leading-[1.45] text-danger"
    >
      <TriangleAlert className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />

      <p className="flex-1">{MESSAGES[error.code]}</p>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Затвори"
        className="shrink-0 rounded-md p-0.5 text-danger/70 transition-colors hover:text-danger"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
