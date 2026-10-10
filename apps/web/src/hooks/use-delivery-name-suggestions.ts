"use client";

import { useQuery } from "@tanstack/react-query";
import type { ShippingMethod } from "@vp-parts-shop/shared";
import {
  deliveryQuarterSuggestionsQueryOptions,
  deliveryStreetSuggestionsQueryOptions,
} from "@/lib/api/delivery";
import { useDebouncedValue } from "./use-debounced-value";

const TYPING_PAUSE_MS = 250;
const NO_NAMES: string[] = [];

/** The street or quarter names the carrier lists in a place that match what was typed. */
export function useDeliveryNameSuggestions(
  list: "streets" | "quarters",
  carrier: ShippingMethod,
  placeId: string | null,
  typed: string,
): string[] {
  const query = useDebouncedValue(typed, TYPING_PAUSE_MS);
  const options =
    list === "streets"
      ? deliveryStreetSuggestionsQueryOptions(carrier, placeId, query)
      : deliveryQuarterSuggestionsQueryOptions(carrier, placeId, query);
  const { data } = useQuery(options);

  return data?.map(({ name }) => name) ?? NO_NAMES;
}
