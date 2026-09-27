import type { ExpressionSpecification } from "maplibre-gl";
import { DeliveryOfficeType, ShippingMethod } from "@vp-parts-shop/shared";

/** Drawn on a 24-unit grid, stroked, the way lucide draws its icons. */
export const OFFICE_GLYPHS: Record<DeliveryOfficeType, readonly string[]> = {
  [DeliveryOfficeType.OFFICE]: [
    "M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z",
    "M12 22V12",
    "M3.3 7 12 12l8.7-5",
    "m7.5 4.27 9 5.15",
  ],
  [DeliveryOfficeType.LOCKER]: [
    "M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z",
    "M12 3v18",
    "M4 9h8",
    "M4 15h8",
    "M12 12h8",
    "M9.5 6v.01M9.5 12v.01M9.5 18v.01M14.5 7.5v.01M14.5 16.5v.01",
  ],
};

export const PIN_VIEWBOX_SIZE = 28;
export const PIN_GLYPH_TRANSFORM = "translate(7 7) scale(0.5833)";

/** A carrier without a colour of its own is drawn in ink. */
const CARRIER_COLOR_TOKENS: Partial<Record<ShippingMethod, string>> = {
  [ShippingMethod.ECONT]: "--carrier-econt",
};

export function carrierColorToken(carrier: ShippingMethod): string {
  return CARRIER_COLOR_TOKENS[carrier] ?? "--ink";
}

const PIN_IMAGE_PREFIX = "office-pin-";

type PinCarrier = ShippingMethod | "selected";

export function officePinImageId(carrier: PinCarrier, type: DeliveryOfficeType): string {
  return `${PIN_IMAGE_PREFIX}${carrier}-${type}`;
}

/** The same id as {@link officePinImageId}, built by the map from each feature's own type. */
export function officePinImageExpression(
  carrier: ExpressionSpecification | "selected",
): ExpressionSpecification {
  return ["concat", PIN_IMAGE_PREFIX, carrier, "-", ["get", "type"]];
}

interface PinDrawing {
  type: DeliveryOfficeType;
  fill: string;
  ring: string;
  /** Edge length in device pixels; MapLibre scales it down by the pixel ratio. */
  size: number;
}

export function officePinSvg({ type, fill, ring, size }: PinDrawing): string {
  const glyph = OFFICE_GLYPHS[type].map((path) => `<path d="${path}"/>`).join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${PIN_VIEWBOX_SIZE} ${PIN_VIEWBOX_SIZE}">` +
    `<circle cx="14" cy="14" r="12.5" fill="${fill}" stroke="${ring}" stroke-width="2"/>` +
    `<g transform="${PIN_GLYPH_TRANSFORM}" fill="none" stroke="${ring}" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round">${glyph}</g></svg>`
  );
}

export function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  return image.decode().then(() => image);
}
