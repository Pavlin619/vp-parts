import { ManufacturerDto } from '@vp-parts-shop/shared';
import { ManufacturerFacetEntry } from './vehicles.mapper';

/**
 * The make list as the selector serves it: popular makes first, ordered by how
 * many vehicles TecDoc catalogues for each; then everything else alphabetically.
 *
 * Both halves have to be sorted here because the facet arrives in ascending
 * `mfrId` order, which is not the alphabet: TecDoc handed out its first ids
 * alphabetically and has appended every make added since, so the head reads
 * A–Z (bar `AUTO UNION` before `AUDI`) and the tail does not read as anything
 * (`MOBILIZE`, `TIGER`, `FIREFLY`, `EXLANTIX`, `AION`). Serving that order to
 * an A–Z grid of 286 makes looks broken.
 *
 * The flag is merged in at the same time rather than a step later, because it
 * is what decides the first half's membership. It comes from a second TecDoc
 * call — the facet carries no popularity signal at all — which is why this
 * takes the two halves as arguments instead of reading either itself.
 */
export function orderManufacturers(
  facet: ManufacturerFacetEntry[],
  popularIds: ReadonlySet<number>,
): ManufacturerDto[] {
  const byName = (a: ManufacturerFacetEntry, b: ManufacturerFacetEntry) =>
    a.name.localeCompare(b.name, 'bg');

  const popular = facet
    .filter((entry) => popularIds.has(entry.id))
    .sort((a, b) => b.vehicleCount - a.vehicleCount || byName(a, b));

  const rest = facet.filter((entry) => !popularIds.has(entry.id)).sort(byName);

  return [...popular, ...rest].map((entry) => ({
    id: String(entry.id),
    name: entry.name,
    isPopular: popularIds.has(entry.id),
  }));
}
