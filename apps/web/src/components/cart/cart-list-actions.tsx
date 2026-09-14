"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";

interface CartListActionsProps {
  onClear: () => void;
}

/** The two ways out of the list: back to browsing, or start over. */
export function CartListActions({ onClear }: CartListActionsProps) {
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

  return (
    <div className="flex items-center justify-between gap-4 px-1 pt-3.5">
      <Link
        href="/catalog"
        className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Продължи пазаруването
      </Link>

      {isConfirmingClear ? (
        <ClearConfirmation
          onConfirm={onClear}
          onCancel={() => setIsConfirmingClear(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setIsConfirmingClear(true)}
          className="text-[13px] text-ink-4 transition-colors hover:text-danger"
        >
          Изпразни кошницата
        </button>
      )}
    </div>
  );
}

/**
 * The ask in front of emptying the cart. The lines live only in this browser,
 * so there is nothing to restore them from — a misclick here is the one action
 * on this page that cannot be undone.
 */
function ClearConfirmation({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-3 text-[13px]">
      <span className="text-ink-2">Да изпразня ли кошницата?</span>

      <button
        type="button"
        onClick={onConfirm}
        className="font-semibold text-danger transition-colors hover:underline"
      >
        Да, изпразни
      </button>

      <button
        type="button"
        onClick={onCancel}
        className="text-ink-3 transition-colors hover:text-ink"
      >
        Отказ
      </button>
    </div>
  );
}
