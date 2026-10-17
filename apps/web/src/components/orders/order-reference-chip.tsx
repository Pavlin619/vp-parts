"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

const COPIED_FOR_MS = 1600;

/** The order's reference, the one thing a customer quotes when they call, with a copy button. */
export function OrderReferenceChip({ reference }: { reference: string }) {
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (!isCopied) {
      return;
    }

    const timer = setTimeout(() => setIsCopied(false), COPIED_FOR_MS);
    return () => clearTimeout(timer);
  }, [isCopied]);

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      setIsCopied(true);
    } catch {
      // Clipboard access refused: the reference stays on screen to copy by hand.
    }
  };

  return (
    <span className="inline-flex h-8 items-center gap-[7px] rounded-md border border-line bg-bg pl-[11px] pr-1 text-[12.5px] text-ink-3">
      <span>Поръчка №</span>
      <b className="font-mono text-[13px] font-semibold text-ink">{reference}</b>
      <button
        type="button"
        onClick={() => void copyReference()}
        aria-label={isCopied ? "Номерът е копиран" : "Копирай номера"}
        className="grid h-[26px] w-[26px] place-items-center rounded text-ink-3 hover:bg-bg-sunken hover:text-ink"
      >
        {isCopied ? (
          <Check className="h-[13px] w-[13px] text-ok" aria-hidden="true" />
        ) : (
          <Copy className="h-[13px] w-[13px]" aria-hidden="true" />
        )}
      </button>
    </span>
  );
}
