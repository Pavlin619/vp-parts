import { ModelSeriesDto, VehicleVariantDto } from '@vp-parts-shop/shared';

/**
 * Model names are half numbers, so the collator has to read them as numbers.
 * Lexically `100 C2` sorts before `80 B4`, which reads as a broken list on
 * every make that names its ranges numerically — AUDI, BMW, PEUGEOT, VOLVO.
 *
 * The `'bg'` locale also puts Cyrillic ahead of Latin, and TecDoc localises
 * only some body words (`Седан`, `купе`, but not `Avant`), so one model range
 * groups its translated bodies before its untranslated ones. That is the
 * storefront's own alphabet rather than a defect — `'en'` reverses it.
 */
const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, 'bg', { numeric: true });

/**
 * A make's model series, alphabetically.
 *
 * Sorted here because TecDoc will not do it: the series list is a *facet*
 * (`vehicleModelSeriesFacets`), and while `getLinkageTargets` takes a `sort`,
 * it applies to the target rows only — sending one with a facet request is
 * answered `200` with the order unchanged, so a fix applied there looks like it
 * worked and does nothing. What arrives is ascending facet id, which is neither
 * the alphabet nor chronological: AUDI opens `80 B4 Седан` (1991), `80 B4
 * Avant` (1991), `100 C2 Седан` (1976), `100 C3 Седан` (1982), `80 B1 Седан`
 * (1972). 133 rows in that order give a visitor nothing to scan by.
 */
export function orderModelSeries(series: ModelSeriesDto[]): ModelSeriesDto[] {
  return [...series].sort(
    (a, b) =>
      byName(a, b) || a.yearFrom - b.yearFrom || a.id.localeCompare(b.id),
  );
}

/**
 * A series' engine variants, alphabetically.
 *
 * `getLinkageTargets` *can* sort these — they are target rows rather than a
 * facet — and it is deliberately not asked to. The whole variant list is read
 * and cached for a day, so a sort applied upstream would be baked into that
 * entry: changing the order later would mean waiting out the TTL, and offering
 * a second order would mean a second entry. Ordering a list already in hand
 * costs nothing and keeps one cached copy, which is the rule the article lists
 * already follow.
 *
 * The name is not unique — TecDoc files two `AMG C 43 4-matic (205.064)` under
 * the W205, at 270 kW from 2016 and 287 kW from 2018 — so the year breaks the
 * tie and the id backs it up, or two reads of one series could disagree.
 */
export function orderVehicleVariants(
  variants: VehicleVariantDto[],
): VehicleVariantDto[] {
  return [...variants].sort(
    (a, b) =>
      byName(a, b) ||
      a.yearFrom - b.yearFrom ||
      a.vehicleId.localeCompare(b.vehicleId),
  );
}
