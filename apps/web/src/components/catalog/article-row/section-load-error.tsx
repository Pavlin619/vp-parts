"use client";

interface SectionLoadErrorProps {
  message: string;
  onRetry: () => void;
}

/**
 * The failure state of a read-on-demand section of a catalog row.
 *
 * Every such section fails the same way — the row around it is intact, only the
 * panel a visitor just opened is missing — so each offers a retry rather than
 * an apology, and they all say so in the same place and the same shape.
 */
export function SectionLoadError({ message, onRetry }: SectionLoadErrorProps) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 text-[13px]">
      <p className="text-ink-3">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="font-semibold text-accent underline underline-offset-2 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Опитай отново
      </button>
    </div>
  );
}
