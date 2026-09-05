import { Injectable } from '@nestjs/common';
import {
  AssemblyGroupDto,
  ModelSeriesDto,
  VehicleVariantDto,
} from '@vp-parts-shop/shared';
import {
  AssemblyGroupType,
  LinkageFunctionTargetType,
  LinkageTargetType,
  TecDocTransport,
} from '../../tecdoc';
import {
  ManufacturerFacetEntry,
  TecDocAssemblyGroupFacetResponse,
  TecDocFavouredManufacturersResponse,
  TecDocManufacturerFacetResponse,
  TecDocModelSeriesFacetResponse,
  TecDocVehicleVariantsResponse,
  collectFavouredManufacturerIds,
  collectManufacturerFacet,
  mapAssemblyGroups,
  mapModelSeries,
  mapVehicleVariants,
} from './vehicles.mapper';

/**
 * What the selector lets a visitor pick: cars and vans, no motorcycles.
 *
 * One constant for all three enumeration steps, because they have to agree —
 * a make list narrower than the model-series list behind it strands a visitor
 * on a make whose series are all bikes. Widening the shop to motorcycles is
 * this line, set to {@link LinkageTargetType.Vehicle}.
 *
 * Exported because every cache key over this data carries it: the tree is held
 * for a week, so a key that did not name its scope would go on serving the
 * previous one for seven days after the line changes.
 */
export const SELECTABLE_VEHICLES = LinkageTargetType.CarAndLcv;

/**
 * The scope the three `getLinkageTargets` enumeration steps share, so that
 * agreeing on {@link SELECTABLE_VEHICLES} is structural rather than a rule three
 * call sites have to remember.
 */
const SELECTOR_SCOPE = {
  linkageTargetCountry: 'BG',
  lang: 'bg',
  linkageTargetType: SELECTABLE_VEHICLES,
} as const;

/**
 * TecDoc source for the vehicle-selection tree: the make facet, the makes
 * TecDoc favours, a make's model series, a series' variants, and the
 * per-vehicle assembly-group (category) tree.
 *
 * One method is one TecDoc call plus the request params it takes. Reading the
 * response envelopes belongs to `vehicles.mapper.ts`; merging the two
 * manufacturer reads, ordering the result and caching any of it belong to
 * {@link VehiclesService}.
 */
@Injectable()
export class VehiclesTecDoc {
  constructor(private readonly transport: TecDocTransport) {}

  /**
   * Every make with a selectable vehicle, and how many each has.
   *
   * This is the make list, and it carries no popularity signal whatsoever —
   * {@link getPopularManufacturerIds} is the only source of that, and the two
   * are joined by the caller.
   */
  async getManufacturerFacet(): Promise<ManufacturerFacetEntry[]> {
    const data = await this.transport.call<TecDocManufacturerFacetResponse>(
      'getLinkageTargets',
      {
        ...SELECTOR_SCOPE,
        perPage: 0,
        page: 1,
        includeMfrFacets: true,
      },
    );

    return collectManufacturerFacet(data);
  }

  /**
   * `favouredList: 1` narrows the response to the favoured makes alone — 35 of
   * the 466 it otherwise returns — rather than all of them for us to filter on
   * `favorFlag`. All 35 fall inside {@link SELECTABLE_VEHICLES}, so narrowing
   * the facet to cars and vans costs the popular section nothing.
   *
   * **It cannot be replaced by ranking the facet's own vehicle count, and what
   * the two disagree about is editorial judgement.** Against the
   * {@link SELECTABLE_VEHICLES} facet they agree exactly to rank 21, so a short
   * popular section looks identical either way; the split is in the tail.
   * TecDoc favours SMART (88 vehicles, rank 52), LADA (134), DAIHATSU (138),
   * ISUZU, DAEWOO and CHRYSLER over the higher-count IVECO (316), LANCIA (328),
   * LAND ROVER (323), SUBARU, DACIA and ALPINA (183) that a count-only cut
   * would promote — a claim about what a shopper looks for rather than about
   * how much TecDoc catalogues, which is not reproducible from the facet.
   * `scripts/make-popularity-compare.mjs` is the measurement.
   *
   * `linkingTargetType` is required (omitting it is refused
   * `400 Field 'linkingTargetType' must be not null`), and this is a *legacy*
   * function, so its letter is a {@link LinkageFunctionTargetType} — where 'P'
   * is passenger car alone — and not the {@link LinkageTargetType} the facet
   * call above sends. The two constants collide on the letter and disagree on
   * its meaning; sending the wrong set's is accepted in silence.
   *
   * The ids join cleanly onto the facet: all 35 `manuId`s are present in the
   * scoped facet, and every name matches its spelling for the same id.
   */
  async getPopularManufacturerIds(): Promise<Set<number>> {
    const data = await this.transport.call<TecDocFavouredManufacturersResponse>(
      'getManufacturers2',
      {
        country: 'BG',
        countryGroupFlag: false,
        lang: 'bg',
        linkingTargetType: LinkageFunctionTargetType.PassengerCar,
        favouredList: 1,
      },
    );

    return collectFavouredManufacturerIds(data);
  }

  async getModelSeries(manufacturerId: number): Promise<ModelSeriesDto[]> {
    const data = await this.transport.call<TecDocModelSeriesFacetResponse>(
      'getLinkageTargets',
      {
        ...SELECTOR_SCOPE,
        mfrIds: manufacturerId,
        perPage: 0,
        page: 1,
        includeVehicleModelSeriesFacets: true,
      },
    );

    return mapModelSeries(data, manufacturerId);
  }

  async getVehicleVariants(seriesId: number): Promise<VehicleVariantDto[]> {
    const data = await this.transport.call<TecDocVehicleVariantsResponse>(
      'getLinkageTargets',
      {
        ...SELECTOR_SCOPE,
        vehicleModelSeriesIds: seriesId,
        perPage: 100,
        page: 1,
      },
    );

    return mapVehicleVariants(data);
  }

  async getAssemblyGroupTree(vehicleId: number): Promise<AssemblyGroupDto[]> {
    const data = await this.transport.call<TecDocAssemblyGroupFacetResponse>(
      'getArticles',
      {
        articleCountry: 'BG',
        lang: 'bg',
        perPage: 0,
        page: 1,
        assemblyGroupFacetOptions: {
          enabled: true,
          assemblyGroupType: AssemblyGroupType.PassengerCar,
          includeCompleteTree: true,
        },
        // Not SELECTOR_SCOPE: this is `getArticles`, which refuses a
        // concatenated code, and the narrowing has already happened upstream —
        // `vehicleId` can only have come from a scoped enumeration. 'P' is also
        // the only single code that accepts both a car and a van id here.
        linkageTargetType: LinkageTargetType.Vehicle,
        linkageTargetId: vehicleId,
      },
    );

    return mapAssemblyGroups(data);
  }
}
