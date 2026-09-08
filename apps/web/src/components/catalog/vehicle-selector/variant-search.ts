import type { VehicleVariantDto } from "@vp-parts-shop/shared";

/**
 * What the engine step searches, which is not what it displays.
 *
 * The step's placeholder offers a search by code, and a code is never in the
 * name: measured over one series, the description carried an engine code in 0
 * of its 28 variants. So a filter over the name alone answers every code query
 * with an empty list — which is how this was found.
 *
 * Both sides are stripped to their alphanumerics before they are compared,
 * because TecDoc spaces and dots a code (`OM 642.852`) and a visitor reading
 * theirs off a block or a registration document has no reason to punctuate it
 * the same way.
 */
export function matchesVariantSearch(
  variant: VehicleVariantDto,
  search: string,
): boolean {
  const query = normalize(search);

  if (!query) return true;

  return searchableValuesOf(variant).some((value) =>
    normalize(value).includes(query),
  );
}

function searchableValuesOf(variant: VehicleVariantDto): string[] {
  return [variant.name, ...variant.engineCodes, ...variant.kbaNumbers];
}

/** Latin and Cyrillic both stay: TecDoc localises part of a description. */
function normalize(value: string): string {
  return value.toLowerCase().replace(/[^0-9a-z\u0430-\u044f]/g, "");
}
