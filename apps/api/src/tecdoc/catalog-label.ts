/**
 * A TecDoc display string as a heading rather than as TecDoc files it.
 *
 * **TecDoc's casing is inconsistent inside a single response**, so a level or a
 * spec table renders as a mix of both spellings rather than as either
 * convention. Measured on an Audi A3 (8L1) 1.6: 4 of its 35 category roots
 * arrive capitalised and 31 lower case; the oil filters' 52 distinct criteria
 * names split 39 lower (`височина [mm]`, `изпълнение на филтъра`) against 13
 * upper (`Тегло [kg]`, `Тип опаковка`); every generic-article name measured is
 * lower (`маслен филтър`).
 *
 * Raising the first character is the whole rule. Both alternatives overreach: a
 * word-by-word transform (CSS `capitalize`) gives `части за сервиз/ Инспекция/
 * Обслужване` four capitals, and upper-casing shouts.
 *
 * Applied to what TecDoc *names* — categories, product types, article
 * descriptions, criteria keys — and deliberately not to three things beside
 * them. Brand names are trademarks whose casing is the brand's own (`ABAKUS`,
 * `A.Z. Meisterteile`, measured 0 of 33 lower). Criteria *values* are data
 * rather than headings, and are mostly numeric (`3/4-16`, `76`). And an
 * autocomplete term is a query the visitor is about to run, not a label: it
 * travels back as `searchQuery` and into a search cache key, where two
 * spellings would be two entries for one search.
 *
 * `docs/TECDOC.md` holds the measurements.
 */
export function catalogLabelOf(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
