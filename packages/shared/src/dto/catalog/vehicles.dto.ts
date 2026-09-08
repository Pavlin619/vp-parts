export interface ManufacturerDto {
  id: string;
  name: string;
  /**
   * TecDoc's own favoured-manufacturer curation — 35 of the 466 makes it
   * catalogues for Bulgaria. It is editorial rather than derived, so it is not
   * reproducible from anything else in the payload; it comes from a second
   * TecDoc call — see `VehiclesTecDoc.getPopularManufacturerIds`.
   *
   * The list arrives with these first, ordered by how many vehicles TecDoc
   * catalogues for each, so a consumer that ignores the flag still gets a
   * sensible default order.
   */
  isPopular: boolean;
}

export interface ModelSeriesDto {
  id: string;
  manufacturerId: string;
  name: string;
  /**
   * The production window of the whole series, which is wider than any one
   * variant's: a C-CLASS (W205) runs 2013–2023 while its C 200 runs 2013–2018
   * and its C 180 2014–2021.
   *
   * Free on the read that lists series — the facet carries `beginYearMonth`
   * with every count, as a `YYYYMM` integer rather than the `YYYY-MM` string
   * the variant records beside it use. Measured over 3,573 series across the 30
   * largest makes: every one carries a start.
   */
  yearFrom: number;
  /** Absent where the series is still built — 26% of them. */
  yearTo: number | null;
}

export interface VehicleVariantDto {
  vehicleId: string;
  seriesId: string;
  name: string;
  yearFrom: number;
  yearTo: number | null;
  /**
   * Every engine code the vehicle was built with, empty where TecDoc files
   * none. It is stamped on the block and printed on a registration document,
   * so it is what a visitor identifies their own car by.
   *
   * A list rather than a code, because a third of vehicles are built with more
   * than one engine: measured over 1,298 variants across the six largest makes,
   * 447 carry several and one carries seven — a Mercedes E 300 CDI files
   * `OM 642.852` and `OM 642.850`. Serving the first alone hid the other from
   * the sheet and from the search over it.
   *
   * Free on the read that lists variants, exactly as `kbaNumbers` is:
   * `getLinkageTargets` sends `engines[]` with every vehicle target.
   */
  engineCodes: string[];
  powerKw: number;
  powerHp: number | null;
  displacementLiters: number | null;
  fuelType: string;
  bodyType: string;
  /**
   * The German type-approval numbers filed for this vehicle, empty where TecDoc
   * files none. It is what a car imported from Germany carries on its
   * registration document, so it is the one field on this DTO a visitor can
   * check their own paperwork against.
   *
   * Free on the read that lists variants: `getLinkageTargets` sends
   * `kbaNumbers` with every vehicle target, exactly as it does `vehicleImages`,
   * so this costs no flag and no second call. Measured over 227 variants across
   * nine series: 218 carry at least one, 59 carry two and 10 carry three.
   */
  kbaNumbers: string[];
  /**
   * Studio side-profile render of the car, or null where TecDoc files none.
   * It is a property of the model series rather than of this variant — every
   * variant of a series carries the identical image — so any variant's URL is
   * usable for the whole series.
   *
   * A signed token with a short and unmeasured life, which is why this DTO is
   * cached for hours where the rest of the vehicle tree gets a week, and why a
   * consumer must expect it to fail to load. See
   * `VehiclesService.getVehicleVariants`.
   */
  imageUrl: string | null;
}

/**
 * One node of a vehicle's category tree, flat — the tree is rebuilt from
 * {@link AssemblyGroupDto.parentId}, and the list arrives depth first so a
 * consumer that ignores the links still reads it in a sensible order.
 *
 * The whole tree is served, all four levels of it: the catalogue page
 * illustrates the roots, but a visitor drilling into `двигател` reaches parts
 * that are three levels down, and a node held back is a part that cannot be
 * found. There is deliberately no leafness field — a node is a leaf when
 * nothing else names it as a parent, which is the same answer from data the
 * consumer already holds. See `VehiclesTecDoc.getAssemblyGroupTree`.
 */
export interface AssemblyGroupDto {
  id: string;
  name: string;
  parentId: string | null;
  /**
   * Articles TecDoc catalogues under this node for this vehicle.
   *
   * **Counts overlap and never sum to the vehicle's total.** TecDoc flattens
   * what a part is, where it sits on the car and why it is replaced into one
   * set of roots, so an article is filed under several: an Audi A3 (8L1) 1.8 T
   * matches 30,367 articles while its 35 roots sum to 45,471. Anything
   * rendering these as shares of a whole shows a number that does not add up.
   */
  articleCount: number;
  /**
   * TecDoc's own ordering, which is mechanical rather than alphabetical — body,
   * engine, filters, belt drive, fuel, exhaust, cooling, clutch, transmission,
   * brakes, suspension, steering, electrics. It is unique within a set of
   * siblings and stable across vehicles, so it is the order the list arrives
   * in; the raw facet arrives alphabetically instead, which puts `вътрешно
   * обурудване` first.
   */
  sortNo: number;
}
