import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface RowCellProps {
  title: string;
  children: ReactNode;
  className?: string;
}

/**
 * One labelled column of a wide row. The label is marked with
 * `data-cell-label` so a surface that prints the column names once above its
 * list — the cart table — can take every in-row label out of sight with a
 * single rule instead of threading a prop through each cell. Out of sight, not
 * out of the accessibility tree: `sr-only`, never `hidden`.
 */
export function RowCell({ title, children, className }: RowCellProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <p
        data-cell-label
        className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.05em] text-ink-4"
      >
        {title}
      </p>
      {children}
    </div>
  );
}
