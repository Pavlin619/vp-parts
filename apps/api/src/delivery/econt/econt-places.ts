import { Injectable, Logger } from '@nestjs/common';
import {
  DeliveryOfficeDto,
  DeliveryPlaceDto,
  ShippingMethod,
} from '@vp-parts-shop/shared';
import { ExpiringMemo } from '../../common';
import { RedisCache } from '../../redis';
import { DeliveryUnavailableException } from '../delivery.exceptions';
import { EcontOffices } from './econt-offices';
import { EcontCityRecord, hasCityList, isCityRecord } from './econt-response';
import { EcontTransport } from './econt.transport';

const PLACES_TTL = 24 * 60 * 60;
const PLACES_MEMORY_TTL_MS = 60 * 60 * 1000;

/** The serving type naming the office Econt delivers a place's parcels to. */
const TO_OFFICE_COURIER = 'to_office_courier';

/** Econt calls the capital's region "София" and the one around it "София Област". */
const REGION_NAMES: Record<string, string> = {
  София: 'София-град',
  'София Област': 'Софийска област',
};

/** A place as Econt lists it, before it is matched against the offices we list. */
interface EcontPlace {
  id: string;
  name: string;
  region: string;
  postCode: string;
  deliveryOfficeCodes: string[];
}

/**
 * Econt's settlements, kept to those a customer can collect a parcel for. Matched
 * against the office list in memory, not in the cache, so a place never names an
 * office the office list no longer carries. See docs/DELIVERY-PROVIDERS.md.
 */
@Injectable()
export class EcontPlaces {
  private readonly logger = new Logger(EcontPlaces.name);
  private readonly memo = new ExpiringMemo<DeliveryPlaceDto[]>(
    PLACES_MEMORY_TTL_MS,
  );

  constructor(
    private readonly transport: EcontTransport,
    private readonly cache: RedisCache,
    private readonly offices: EcontOffices,
  ) {}

  list(): Promise<DeliveryPlaceDto[]> {
    return this.memo.get(async () => {
      const [places, offices] = await Promise.all([
        this.cache.cached('econt:places:BGR', PLACES_TTL, () => this.load()),
        this.offices.list(),
      ]);

      return collectablePlaces(places, offices);
    });
  }

  /** Throws rather than answer an empty list, so the cache keeps nothing and the next read retries. */
  private async load(): Promise<EcontPlace[]> {
    const response = await this.transport.readNomenclature(
      'Nomenclatures/NomenclaturesService.getCities',
      { countryCode: 'BGR' },
    );
    const places = this.cityRecordsOf(response)
      .filter(hasRegion)
      .map(toEcontPlace);

    if (places.length === 0) {
      this.unavailable('Econt listed no place');
    }

    return places;
  }

  private cityRecordsOf(response: unknown): EcontCityRecord[] {
    const rows = hasCityList(response) ? response.cities : null;

    if (!rows) {
      this.unavailable('Econt answered getCities without a city list');
    }

    const records = rows.filter(isCityRecord);
    const malformedCount = rows.length - records.length;

    if (malformedCount > 0) {
      this.logger.warn(`Skipped ${malformedCount} malformed Econt place(s)`);
    }

    return records;
  }

  private unavailable(reason: string): never {
    this.logger.error(reason);

    throw new DeliveryUnavailableException();
  }
}

/** Econt files holiday areas and a "Мобилен РЦ" entry without a region; none is a settlement. */
function hasRegion(city: EcontCityRecord): boolean {
  return Boolean(city.regionName?.trim());
}

function toEcontPlace(city: EcontCityRecord): EcontPlace {
  return {
    id: String(city.id),
    name: city.name,
    region: city.regionName!.trim(),
    postCode: city.postCode,
    deliveryOfficeCodes: (city.servingOffices ?? [])
      .filter(({ servingType }) => servingType === TO_OFFICE_COURIER)
      .map(({ officeCode }) => officeCode),
  };
}

/**
 * A place with an office of its own, or one whose delivery office we list. Econt also
 * names mobile stations and codes that getOffices does not carry, which no one can
 * collect from.
 */
function collectablePlaces(
  places: EcontPlace[],
  offices: DeliveryOfficeDto[],
): DeliveryPlaceDto[] {
  const placesWithOffice = new Set(offices.map(({ placeId }) => placeId));
  const listedCodes = new Set(offices.map(({ code }) => code));

  return places.flatMap((place) => {
    if (placesWithOffice.has(place.id)) {
      return [toPlaceDto(place, null)];
    }

    const servingCode = place.deliveryOfficeCodes.find((code) =>
      listedCodes.has(code),
    );

    return servingCode ? [toPlaceDto(place, servingCode)] : [];
  });
}

function toPlaceDto(
  { id, name, region, postCode }: EcontPlace,
  servingOfficeCode: string | null,
): DeliveryPlaceDto {
  return {
    carrier: ShippingMethod.ECONT,
    id,
    name,
    region: REGION_NAMES[region] ?? region,
    postCode,
    servingOfficeCode,
  };
}
