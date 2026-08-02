"use client";

import { Check, Copy } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

interface PartNumberChipProps {
  code: string;
  /**
   * The marque the number belongs to — a vehicle manufacturer for an OE number,
   * a parts brand for a cross-reference. Several, comma-joined, when one number
   * is filed under more than one marque.
   */
  manufacturer?: string;
  /** Shown beside the code, e.g. how far the part interchanges with the OE one. */
  note?: string;
}

/**
 * A copyable OE / cross-reference number. Counter staff read these out and
 * paste them into supplier systems all day, so one click copies the code and
 * the chip confirms it in place.
 */
export function PartNumberChip({
  code,
  manufacturer,
  note,
}: PartNumberChipProps) {
  const { isCopied, copy } = useCopyToClipboard(code);

  const copyLabel = manufacturer
    ? `Копирай номер ${code} на ${manufacturer}`
    : `Копирай номер ${code}`;

  return (
    <button
      type="button"
      onClick={copy}
      title="Копирай номер"
      aria-label={isCopied ? "Копирано" : copyLabel}
      className="inline-flex items-center gap-2 rounded-md border border-line bg-bg-card px-2.5 py-1.5 text-xs transition-colors hover:border-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span className="font-mono font-semibold text-ink">{code}</span>

      {manufacturer && (
        <span className="border-l border-line pl-2 text-[10.5px] uppercase tracking-[0.04em] text-ink-3">
          {manufacturer}
        </span>
      )}

      {note && (
        <span className="border-l border-line pl-2 text-[10.5px] text-ink-3">
          {note}
        </span>
      )}

      {isCopied ? (
        <Check className="h-3 w-3 shrink-0 text-ok" aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3 shrink-0 text-ink-4" aria-hidden="true" />
      )}
    </button>
  );
}
