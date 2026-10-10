import { Injectable, Logger } from '@nestjs/common';
import {
  DeliveryAddressDto,
  DeliveryAddressValidationDto,
  DeliveryAddressValidationStatus,
  DeliveryQuarterDto,
  DeliveryStreetDto,
} from '@vp-parts-shop/shared';
import { RedisCache } from '../../redis';
import { DeliveryUnavailableException } from '../delivery.exceptions';
import { econtAddressOf } from './econt-address';
import {
  EcontNamedRecord,
  EcontValidatedAddress,
  hasQuarterList,
  hasStreetList,
  isNamedRecord,
  isValidatedAddress,
  refusesAddress,
} from './econt-response';
import { EcontRefusedException, EcontTransport } from './econt.transport';

const NAMES_TTL = 24 * 60 * 60;

const MAX_SUGGESTIONS = 20;

const COUNTRY_CODE = 'BGR';

const INVALID_STATUS = 'invalid';

type NameKind = 'streets' | 'quarters';

const NAME_SERVICES: Record<NameKind, string> = {
  streets: 'Nomenclatures/NomenclaturesService.getStreets',
  quarters: 'Nomenclatures/NomenclaturesService.getQuarters',
};

/**
 * Econt's streets and quarters of a place, and its check of a typed address. Both
 * lists are public nomenclatures; Sofia alone has 4,048 streets, so they are
 * filtered here and never shipped whole. See docs/DELIVERY-PROVIDERS.md.
 */
@Injectable()
export class EcontAddresses {
  private readonly logger = new Logger(EcontAddresses.name);

  constructor(
    private readonly transport: EcontTransport,
    private readonly cache: RedisCache,
  ) {}

  streets(placeId: string, query: string): Promise<DeliveryStreetDto[]> {
    return this.suggest('streets', placeId, query);
  }

  quarters(placeId: string, query: string): Promise<DeliveryQuarterDto[]> {
    return this.suggest('quarters', placeId, query);
  }

  async validate(
    address: DeliveryAddressDto,
  ): Promise<DeliveryAddressValidationDto> {
    const checked = await this.check(address);

    if (checked === null || checked.validationStatus === INVALID_STATUS) {
      return {
        status: DeliveryAddressValidationStatus.INVALID,
        suggested: null,
      };
    }

    const suggested = correctionOf(address, checked);

    return suggested
      ? { status: DeliveryAddressValidationStatus.UNCERTAIN, suggested }
      : { status: DeliveryAddressValidationStatus.VALID, suggested: null };
  }

  private async suggest(
    kind: NameKind,
    placeId: string,
    query: string,
  ): Promise<DeliveryStreetDto[]> {
    const names = await this.cache.cached(
      `econt:${kind}:${placeId}`,
      NAMES_TTL,
      () => this.load(kind, placeId),
    );

    return matching(names, query).slice(0, MAX_SUGGESTIONS);
  }

  private async load(
    kind: NameKind,
    placeId: string,
  ): Promise<DeliveryStreetDto[]> {
    const response = await this.transport.readNomenclature(
      NAME_SERVICES[kind],
      {
        countryCode: COUNTRY_CODE,
        cityID: Number(placeId),
      },
    );
    const rows = this.rowsOf(kind, response);
    const records = rows.filter(isNamedRecord);
    const malformedCount = rows.length - records.length;

    if (malformedCount > 0) {
      this.logger.warn(`Skipped ${malformedCount} malformed Econt ${kind}`);
    }

    return records.map(toNameDto);
  }

  private rowsOf(kind: NameKind, response: unknown): unknown[] {
    const rows =
      kind === 'streets'
        ? hasStreetList(response) && response.streets
        : hasQuarterList(response) && response.quarters;

    if (!rows) {
      this.logger.error(`Econt answered ${NAME_SERVICES[kind]} without a list`);
      throw new DeliveryUnavailableException();
    }

    return rows;
  }

  /** Null when Econt refuses the street or quarter itself, which is an answer, not a failure. */
  private async check(
    address: DeliveryAddressDto,
  ): Promise<EcontValidatedAddress | null> {
    let response: unknown;

    try {
      response = await this.transport.readNomenclature(
        'Nomenclatures/AddressService.validateAddress',
        { address: econtAddressOf(address) },
      );
    } catch (error) {
      if (
        error instanceof EcontRefusedException &&
        refusesAddress(error.refusal)
      ) {
        return null;
      }

      throw error;
    }

    if (!isValidatedAddress(response)) {
      this.logger.error('Econt answered validateAddress without a status');
      throw new DeliveryUnavailableException();
    }

    return response;
  }
}

function toNameDto({ id, name }: EcontNamedRecord): DeliveryStreetDto {
  return { id: String(id), name: name.trim() };
}

/** Names that contain every word of the query, anywhere, in any case. */
function matching(
  names: DeliveryStreetDto[],
  query: string,
): DeliveryStreetDto[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);

  return names.filter(({ name }) => {
    const lowered = name.toLowerCase();

    return words.every((word) => lowered.includes(word));
  });
}

/** The address as Econt corrected it, or null when it kept the street and quarter we sent. */
function correctionOf(
  sent: DeliveryAddressDto,
  { address }: EcontValidatedAddress,
): DeliveryAddressDto | null {
  const street = textOf(address.street);
  const quarter = textOf(address.quarter);

  if (isSame(sent.street, street) && isSame(sent.quarter, quarter)) {
    return null;
  }

  return {
    ...sent,
    ...(street && { street }),
    ...(textOf(address.num) && { streetNumber: textOf(address.num) }),
    ...(quarter && { quarter }),
  };
}

function textOf(value: string | null): string | undefined {
  return value?.trim() || undefined;
}

function isSame(
  sent: string | undefined,
  returned: string | undefined,
): boolean {
  return (sent?.trim().toLowerCase() ?? '') === (returned?.toLowerCase() ?? '');
}
