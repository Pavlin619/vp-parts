import type { DeliveryBand } from "./availability";

/**
 * Delivery-speed palette shared by every surface that shows a delivery/stock
 * signal (the buy-box availability dot and the catalog row's delivery chip).
 * `dot` is the fill, `text` the readable inline tone tied to the delivery date,
 * and `halo` the soft ring rendered only behind the buy-box headline dot. The
 * scale runs green → blue → yellow → orange as the promise slows.
 */
export const DELIVERY_BAND: Record<
  DeliveryBand,
  { dot: string; text: string; halo: string; soft: string }
> = {
  "within-hour": {
    dot: "bg-ok",
    text: "text-ok",
    halo: "shadow-[0_0_0_3px_var(--color-ok-soft)]",
    soft: "bg-[var(--color-ok-soft)]",
  },
  today: {
    dot: "bg-info",
    text: "text-info",
    halo: "shadow-[0_0_0_3px_var(--color-info-soft)]",
    soft: "bg-[var(--color-info-soft)]",
  },
  day1: {
    dot: "bg-delivery-day1",
    text: "text-delivery-day1-fg",
    halo: "shadow-[0_0_0_3px_var(--color-delivery-day1-soft)]",
    soft: "bg-[var(--color-delivery-day1-soft)]",
  },
  day2: {
    dot: "bg-delivery-day2",
    text: "text-delivery-day2-fg",
    halo: "shadow-[0_0_0_3px_var(--color-delivery-day2-soft)]",
    soft: "bg-[var(--color-delivery-day2-soft)]",
  },
  day3: {
    dot: "bg-delivery-day3",
    text: "text-delivery-day3-fg",
    halo: "shadow-[0_0_0_3px_var(--color-delivery-day3-soft)]",
    soft: "bg-[var(--color-delivery-day3-soft)]",
  },
};

/**
 * Relative, hydration-safe delivery label per speed band. Unlike
 * `formatDeliveryLabel`, these carry no absolute date, so a list of catalog rows
 * can render a delivery promise without threading a live clock through every
 * row (which would risk an SSR/client hydration mismatch). The buy box, which
 * already owns a shared clock, keeps using the dated label.
 */
export const DELIVERY_BAND_LABEL: Record<DeliveryBand, string> = {
  "within-hour": "за днес",
  today: "за днес",
  day1: "за 1 работен ден",
  day2: "за 2 работни дни",
  day3: "3+ работни дни",
};
