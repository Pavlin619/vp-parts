import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DeliveryChipProps {
  /** Carries the state's tone — a delivery band's soft fill and text colour. */
  className: string;
  children: ReactNode;
}

/** The delivery cell's badge, shared by the catalog row and the cart line. */
export function DeliveryChip({ className, children }: DeliveryChipProps) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-[5px] px-2 py-[5px] text-[11.5px] font-semibold leading-[1.2]",
        className,
      )}
    >
      {children}
    </span>
  );
}
