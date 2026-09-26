import { Injectable, Logger } from '@nestjs/common';
import {
  DeliveryOfficeDto,
  DeliveryOfficeType,
  ShippingMethod,
} from '@vp-parts-shop/shared';
import { ExpiringMemo } from '../../common';
import { RedisCache } from '../../redis';
import { DeliveryUnavailableException } from '../delivery.exceptions';
import { officeHoursOf } from './econt-office-hours';
import {
  EcontOfficeRecord,
  hasOfficeList,
  isOfficeRecord,
} from './econt-response';
import { EcontTransport } from './econt.transport';

const OFFICES_TTL = 24 * 60 * 60;
const OFFICES_MEMORY_TTL_MS = 60 * 60 * 1000;

interface OfficeIndex {
  list: DeliveryOfficeDto[];
  byCode: ReadonlyMap<string, DeliveryOfficeDto>;
}

@Injectable()
export class EcontOffices {
  private readonly logger = new Logger(EcontOffices.name);
  private readonly index = new ExpiringMemo<OfficeIndex>(OFFICES_MEMORY_TTL_MS);

  constructor(
    private readonly transport: EcontTransport,
    private readonly cache: RedisCache,
  ) {}

  async list(): Promise<DeliveryOfficeDto[]> {
    return (await this.officeIndex()).list;
  }

  async find(code: string): Promise<DeliveryOfficeDto | undefined> {
    return (await this.officeIndex()).byCode.get(code);
  }

  /** Held in memory so a quote does not parse the whole cached list to find one office. */
  private officeIndex(): Promise<OfficeIndex> {
    return this.index.get(async () =>
      indexOffices(
        await this.cache.cached('econt:offices:BGR', OFFICES_TTL, () =>
          this.load(),
        ),
      ),
    );
  }

  /** Throws rather than answer an empty list, so the cache keeps nothing and the next read retries. */
  private async load(): Promise<DeliveryOfficeDto[]> {
    const response = await this.transport.readNomenclature(
      'Nomenclatures/NomenclaturesService.getOffices',
      { countryCode: 'BGR' },
    );
    const offices = this.officeRecordsOf(response)
      .filter(isCustomerPickupPoint)
      .map(toOfficeDto);

    if (offices.length === 0) {
      this.unavailable('Econt listed no office a customer can collect from');
    }

    return offices;
  }

  private officeRecordsOf(response: unknown): EcontOfficeRecord[] {
    const rows = hasOfficeList(response) ? response.offices : null;

    if (!rows) {
      this.unavailable('Econt answered getOffices without an office list');
    }

    const records = rows.filter(isOfficeRecord);
    const malformedCount = rows.length - records.length;

    if (malformedCount > 0) {
      this.logger.warn(`Skipped ${malformedCount} malformed Econt office(s)`);
    }

    return records;
  }

  private unavailable(reason: string): never {
    this.logger.error(reason);

    throw new DeliveryUnavailableException();
  }
}

function indexOffices(list: DeliveryOfficeDto[]): OfficeIndex {
  return { list, byCode: new Map(list.map((office) => [office.code, office])) };
}

function isCustomerPickupPoint(office: EcontOfficeRecord): boolean {
  return !office.isMPS && !office.isDrive && office.address.location !== null;
}

function toOfficeDto(office: EcontOfficeRecord): DeliveryOfficeDto {
  const { city, fullAddress, location } = office.address;

  return {
    carrier: ShippingMethod.ECONT,
    code: office.code,
    name: office.name,
    city: city.name,
    postCode: city.postCode,
    address: fullAddress.trim(),
    latitude: location!.latitude,
    longitude: location!.longitude,
    type: office.isAPS ? DeliveryOfficeType.LOCKER : DeliveryOfficeType.OFFICE,
    weekdayHours: officeHoursOf(
      office.normalBusinessHoursFrom,
      office.normalBusinessHoursTo,
    ),
    saturdayHours: officeHoursOf(
      office.halfDayBusinessHoursFrom,
      office.halfDayBusinessHoursTo,
    ),
  };
}
