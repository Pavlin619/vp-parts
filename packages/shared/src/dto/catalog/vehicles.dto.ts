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
}

export interface VehicleVariantDto {
  vehicleId: string;
  seriesId: string;
  name: string;
  yearFrom: number;
  yearTo: number | null;
  engine: string;
  powerKw: number;
  powerHp: number | null;
  displacementLiters: number | null;
  fuelType: string;
  bodyType: string;
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

export interface AssemblyGroupDto {
  id: string;
  name: string;
  parentId: string | null;
}
