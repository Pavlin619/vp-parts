import { Injectable, Logger } from '@nestjs/common';
import { LinkedVehicleManufacturerDto } from '@vp-parts-shop/shared';
import { batched, mapWithConcurrency } from '../../../common';
import {
  LinkageFunctionTargetType,
  LinkedVehicleWithSeries,
  TecDocTransport,
  legacyArticleIdsOf,
} from '../../../tecdoc';
import {
  ArticleLookupResponse,
  articleLookupPayload,
  requireArticle,
} from '../article-lookup';
import {
  TecDocArticleLinkagesResponse,
  TecDocLinkedManufacturerResponse,
  TecDocVehicleRecord,
  TecDocVehiclesResponse,
  collectLinkedManufacturers,
  collectLinkedTargetIds,
  collectLinkedVehicles,
  mapLinkedVehicle,
} from './linked-vehicles.mapper';

/**
 * The country scope the three linkage calls (Onboarding Guide §8.4) share.
 *
 * `countryGroupFlag` is mandatory on all of them and decides whether `country`
 * names one ISO country or a TecDoc country group, so leaving it out did not
 * save a field — it handed the choice of which linkages a Bulgarian visitor
 * sees to a default the interface does not document.
 */
const LINKAGE_SCOPE = {
  articleCountry: 'BG',
  country: 'BG',
  countryGroupFlag: false,
  lang: 'bg',
} as const;

/**
 * What `linkingTargetId` takes when the caller has no single vehicle in mind.
 * The parameter names a linkage target to *exclude*, and the Service Index
 * entry states it outright: "If this function is used after an article direct
 * search (and no linkingTargetId is given) the linkingTargetId can be set to
 * -1." An article direct search is how every call here is reached.
 */
const NO_EXCLUDED_LINKING_TARGET = -1;

/**
 * The detail blocks `getVehicleByIds4` demands a verdict on. The Service Index
 * marks most of them required, so an omitted flag decided nothing; only
 * `motorCodes` is asked for, because engine codes are what a mechanic matches
 * against the block and the rest would pad a response already fetched a make at
 * a time.
 */
const VEHICLE_DETAIL_BLOCKS = {
  axles: false,
  cabs: false,
  kbaData: false,
  motorCodes: true,
  protoTypes: false,
  registrationInfo: false,
  secondaryTypes: false,
  wheelbases: false,
} as const;

/**
 * The documented ceiling on one `getVehicleByIds4` call: "List of Vehicle ID's
 * (max 25)". A make of a common service part runs well past it, and a request
 * over the limit comes back short rather than rejected — a truncated fit list,
 * which a mechanic reads as "this part does not fit my car".
 */
export const VEHICLE_HYDRATION_BATCH_SIZE = 25;

/**
 * How many hydration batches one read keeps in flight.
 *
 * Hydration is the only fan-out in the catalogue: every other read is a call or
 * two, while a wide make is dozens. Sending them all at once is a burst one
 * visitor has no reason to produce, and it buys nothing — TecDoc is the
 * bottleneck either way, so the same calls finish in roughly the same time
 * whether they leave together or a few at a time.
 */
const HYDRATION_FAN_OUT = 4;

/**
 * TecDoc source for the applicable-vehicles section: the article's linkage ids,
 * the makes those linkages span, one make's linkage targets, and the vehicles
 * behind them (Onboarding Guide §8.4).
 *
 * Every method here is one TecDoc call plus its request params and response
 * envelope. Merging the answers across an article's roles, caching them and
 * grouping them for display all belong to {@link LinkedVehiclesService}. Two
 * judgements are made here, both forced by the upstream: the documented 25-id
 * ceiling on hydration, and how many of those batches travel at once.
 */
@Injectable()
export class LinkedVehiclesTecDoc {
  private readonly logger = new Logger(LinkedVehiclesTecDoc.name);

  constructor(private readonly transport: TecDocTransport) {}

  /**
   * Every `legacyArticleId` an article number resolves to — the only id the
   * linkage functions accept. TecDoc files one per article/generic-article pair
   * rather than one per part, so a part catalogued in two roles (an oil filter
   * that is also part of a filter set) carries two, with its vehicle linkages
   * split across both.
   *
   * All of them are returned and the caller merges. Listing one role's vehicles
   * would drop the other's, and which role came first is TecDoc's array order —
   * nothing documents it, so the answer could change between data releases with
   * no change here.
   *
   * An unknown number is a genuine miss rather than a failed read, so it
   * surfaces as a 404 — the same verdict the article detail read reaches for the
   * same input. A known part with no generic article at all is a different
   * answer: an empty list.
   *
   * This is the fallback path. A catalog listing already carried these ids for
   * every row it returned, on the `genericArticles` it reads the description
   * from, so a part a visitor reached through the catalog is normally answered
   * from that memo without coming back here.
   */
  async getLegacyArticleIds(
    brandId: number,
    articleNumber: string,
  ): Promise<number[]> {
    const data = await this.transport.call<ArticleLookupResponse>(
      'getArticles',
      {
        ...articleLookupPayload(brandId, articleNumber),
        includeGenericArticles: true,
      },
    );

    return legacyArticleIdsOf(requireArticle(data, articleNumber, this.logger));
  }

  /**
   * The makes one article is linked to — §8.4 step 1, and step 1 of the
   * Functions guide's "Find linked vehicles" sequence. Names and ids only;
   * TecDoc files no count here, which is why the makes level of the section
   * shows none.
   */
  async getLinkedManufacturers(
    legacyArticleId: number,
  ): Promise<LinkedVehicleManufacturerDto[]> {
    const data = await this.transport.call<TecDocLinkedManufacturerResponse>(
      'getArticleLinkedAllLinkingTargetManufacturer2',
      {
        ...LINKAGE_SCOPE,
        articleId: legacyArticleId,
        linkingTargetType: LinkageFunctionTargetType.PassengerCar,
      },
    );

    return collectLinkedManufacturers(data);
  }

  /**
   * The ids of the vehicles one `legacyArticleId` is linked to, narrowed to a
   * single make (§8.4 step 2). Ids and nothing else — {@link getVehiclesByIds}
   * is what turns them into vehicles.
   *
   * The make is not optional and not a filter we chose: the Service Index
   * titles this function "Get linked vehicles, motors, axles of an article **by
   * manufacturer**" and marks `linkingTargetManuId` required. The call takes no
   * page parameters and its response carries no `maxAllowedPage`, so within one
   * make it answers with every linkage on file.
   *
   * Note the singular `linkingTargetType`: this function predates the
   * `linkageTarget*` naming the rest of the catalog uses, and silently ignores
   * the other spelling rather than rejecting it. Its letters differ too — see
   * {@link LinkageFunctionTargetType}.
   *
   * `withMainArticles: false` keeps the answer to the vehicles filed against
   * this part. TecDoc will also report the ones filed against the parent
   * article it belongs to — the kit a tensioner pulley ships in — in a separate
   * `mainArticleLinkages` collection. Asking for them here would not surface
   * them: the makes call has no such option, so a make reachable only through
   * the parent never reaches the level a visitor opens.
   */
  async getLinkedTargetIds(
    legacyArticleId: number,
    manufacturerId: number,
  ): Promise<number[]> {
    const data = await this.transport.call<TecDocArticleLinkagesResponse>(
      'getArticleLinkedAllLinkingTarget4',
      {
        ...LINKAGE_SCOPE,
        articleId: legacyArticleId,
        linkingTargetId: NO_EXCLUDED_LINKING_TARGET,
        linkingTargetManuId: manufacturerId,
        linkingTargetType: LinkageFunctionTargetType.PassengerCar,
        withMainArticles: false,
      },
    );

    return collectLinkedTargetIds(data);
  }

  /**
   * The vehicles behind a list of linkage target ids, with the model series
   * each belongs to. The only read that hydrates rows, and only for the make a
   * visitor actually opened.
   *
   * Split into batches of {@link VEHICLE_HYDRATION_BATCH_SIZE} because that is
   * the documented ceiling on one call, at most {@link HYDRATION_FAN_OUT} of
   * them in flight, and merged back in the order the ids were given.
   *
   * This is the Functions guide's step 3 answered with `getVehicleByIds4`
   * rather than the `getArticleLinkedAllLinkingTargetsByIds3` it names. That
   * function is article-scoped and would need no id ceiling of its own — it has
   * the same 25 — but it files neither fuel type nor motor codes, two of the
   * five columns the section shows, and its rows are per article-link rather
   * than per vehicle, so they could not be cached across the articles that
   * share a vehicle.
   */
  async getVehiclesByIds(carIds: number[]): Promise<LinkedVehicleWithSeries[]> {
    const records = (
      await mapWithConcurrency(
        batched(carIds, VEHICLE_HYDRATION_BATCH_SIZE),
        HYDRATION_FAN_OUT,
        (ids) => this.hydrateVehicles(ids),
      )
    ).flat();

    // Ids can go in that no vehicle comes back for. Ordinary on its own —
    // TecDoc retires vehicles — but nothing else would show a make quietly
    // listing fewer modifications than the part actually fits.
    if (records.length < carIds.length) {
      this.logger.warn(
        `Hydrated ${records.length} of ${carIds.length} requested vehicles; ` +
          'the rest are not listed.',
      );
    }

    return records.map(mapLinkedVehicle);
  }

  /** One `getVehicleByIds4` call, sized to the documented id ceiling. */
  private async hydrateVehicles(
    carIds: number[],
  ): Promise<TecDocVehicleRecord[]> {
    const data = await this.transport.call<TecDocVehiclesResponse>(
      'getVehicleByIds4',
      {
        ...LINKAGE_SCOPE,
        ...VEHICLE_DETAIL_BLOCKS,
        countriesCarSelection: 'BG',
        carIds: { array: carIds },
      },
    );

    return collectLinkedVehicles(data);
  }
}
