import type { DeliveryOfficeType, ShippingMethod } from "@vp-parts-shop/shared";
import {
  carrierColorToken,
  OFFICE_GLYPHS,
  PIN_GLYPH_TRANSFORM,
  PIN_VIEWBOX_SIZE,
} from "@/lib/checkout/delivery/office-pin";
import { cn } from "@/lib/utils";

interface OfficePinIconProps {
  carrier: ShippingMethod;
  type: DeliveryOfficeType;
  className?: string;
}

/** The office's map pin, repeated beside it in the list. */
export function OfficePinIcon({
  carrier,
  type,
  className,
}: OfficePinIconProps) {
  const fill = `var(${carrierColorToken(carrier)})`;

  return (
    <svg
      aria-hidden="true"
      data-office-type={type}
      viewBox={`0 0 ${PIN_VIEWBOX_SIZE} ${PIN_VIEWBOX_SIZE}`}
      className={cn("h-7 w-7 shrink-0", className)}
    >
      <circle cx="14" cy="14" r="12.5" fill={fill} stroke="var(--bg-alt)" strokeWidth="2" />
      <g
        transform={PIN_GLYPH_TRANSFORM}
        fill="none"
        stroke="var(--bg-alt)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {OFFICE_GLYPHS[type].map((path) => (
          <path key={path} d={path} />
        ))}
      </g>
    </svg>
  );
}
