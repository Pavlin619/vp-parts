import { ShippingMethod } from "@vp-parts-shop/shared";
import { cn } from "@/lib/utils";

/** Latin initials, as both brands write them: the display font carries no Cyrillic. */
const CARRIER_MARKS: Record<ShippingMethod, { initial: string; colour: string }> = {
  [ShippingMethod.ECONT]: { initial: "E", colour: "bg-[#1F4FBF]" },
  [ShippingMethod.SPEEDY]: { initial: "S", colour: "bg-[#C3241C]" },
};

/** The carrier's initial on its brand colour, beside a place it delivers to. */
export function CarrierMark({ carrier }: { carrier: ShippingMethod }) {
  const { initial, colour } = CARRIER_MARKS[carrier];

  return (
    <span
      aria-hidden="true"
      data-testid="carrier-mark"
      className={cn(
        "inline-grid h-[18px] w-[18px] shrink-0 place-items-center rounded-sm font-display text-[9.5px] leading-none font-bold text-white",
        colour,
      )}
    >
      {initial}
    </span>
  );
}
