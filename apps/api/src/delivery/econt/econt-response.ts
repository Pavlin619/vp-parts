/** The fields of Econt's `Office` we read. */
export interface EcontOfficeRecord {
  code: string;
  name: string;
  isAPS: boolean;
  /** A mobile station that stands somewhere on a schedule — not a place to send a customer. */
  isMPS: boolean;
  /** Econt Drive takes at most 20 kg and 90×90×90 cm, which we cannot promise a parcel fits. */
  isDrive: boolean;
  address: {
    city: { id: number; name: string; postCode: string | null };
    fullAddress: string;
    location: { latitude: number; longitude: number } | null;
  };
  normalBusinessHoursFrom: number | null;
  normalBusinessHoursTo: number | null;
  halfDayBusinessHoursFrom: number | null;
  halfDayBusinessHoursTo: number | null;
}

/** The fields of Econt's `City` we read. */
export interface EcontCityRecord {
  id: number;
  name: string;
  regionName: string | null;
  postCode: string;
  servingOffices: { officeCode: string; servingType: string }[] | null;
}

/** The fields of Econt's `Street` and `Quarter` we read. */
export interface EcontNamedRecord {
  id: number;
  name: string;
}

/** What `AddressService.validateAddress` answers, as far as we read it. */
export interface EcontValidatedAddress {
  validationStatus: string;
  address: {
    street: string | null;
    num: string | null;
    quarter: string | null;
  };
}

/**
 * What `LabelService.createLabel` answers in `calculate` mode, as far as we read it.
 * The `unknown` fields only feed a log line, so a quote does not fail on them.
 */
export interface EcontCalculatedLabel {
  label: {
    totalPrice: number;
    currency: string;
    expectedDeliveryDate: number | null;
    shipmentType?: unknown;
  };
  delayedDeliveryWarning?: unknown;
}

/** Econt's error tree, answered with HTTP 517. */
export interface EcontError {
  type?: string;
  message?: string;
  innerErrors?: EcontError[];
}

type Fields = Record<string, unknown>;

/** Sender and receiver errors share types; only the `получател:` message prefix names the receiver. */
const RECEIVER_PREFIX = 'получател:';

export function hasOfficeList(value: unknown): value is { offices: unknown[] } {
  return isFields(value) && Array.isArray(value.offices);
}

export function isOfficeRecord(value: unknown): value is EcontOfficeRecord {
  return (
    isFields(value) &&
    typeof value.code === 'string' &&
    typeof value.name === 'string' &&
    typeof value.isAPS === 'boolean' &&
    typeof value.isMPS === 'boolean' &&
    typeof value.isDrive === 'boolean' &&
    isOfficeAddress(value.address) &&
    isNumberOrNull(value.normalBusinessHoursFrom) &&
    isNumberOrNull(value.normalBusinessHoursTo) &&
    isNumberOrNull(value.halfDayBusinessHoursFrom) &&
    isNumberOrNull(value.halfDayBusinessHoursTo)
  );
}

export function hasCityList(value: unknown): value is { cities: unknown[] } {
  return isFields(value) && Array.isArray(value.cities);
}

export function isCityRecord(value: unknown): value is EcontCityRecord {
  return (
    isFields(value) &&
    typeof value.id === 'number' &&
    typeof value.name === 'string' &&
    (value.regionName === null || typeof value.regionName === 'string') &&
    typeof value.postCode === 'string' &&
    (value.servingOffices === null ||
      (Array.isArray(value.servingOffices) &&
        value.servingOffices.every(isServingOffice)))
  );
}

export function hasStreetList(value: unknown): value is { streets: unknown[] } {
  return isFields(value) && Array.isArray(value.streets);
}

export function hasQuarterList(
  value: unknown,
): value is { quarters: unknown[] } {
  return isFields(value) && Array.isArray(value.quarters);
}

export function isNamedRecord(value: unknown): value is EcontNamedRecord {
  return (
    isFields(value) &&
    typeof value.id === 'number' &&
    typeof value.name === 'string' &&
    value.name.trim() !== ''
  );
}

export function isValidatedAddress(
  value: unknown,
): value is EcontValidatedAddress {
  return (
    isFields(value) &&
    typeof value.validationStatus === 'string' &&
    isFields(value.address) &&
    isStringOrNull(value.address.street) &&
    isStringOrNull(value.address.num) &&
    isStringOrNull(value.address.quarter)
  );
}

export function isCalculatedLabel(
  value: unknown,
): value is EcontCalculatedLabel {
  if (!isFields(value) || !isFields(value.label)) {
    return false;
  }

  const { totalPrice, currency, expectedDeliveryDate } = value.label;

  return (
    typeof totalPrice === 'number' &&
    Number.isFinite(totalPrice) &&
    totalPrice >= 0 &&
    typeof currency === 'string' &&
    isNumberOrNull(expectedDeliveryDate)
  );
}

const INVALID_ADDRESS_TYPE = 'ExInvalidAddress';

/** Econt refuses an unknown street or quarter this way instead of answering `invalid`. */
export function refusesAddress(error: EcontError): boolean {
  return (
    error.type === INVALID_ADDRESS_TYPE ||
    (error.innerErrors ?? []).some(refusesAddress)
  );
}

export function refusesReceiver(error: EcontError): boolean {
  return (
    Boolean(error.message?.trim().startsWith(RECEIVER_PREFIX)) ||
    (error.innerErrors ?? []).some(refusesReceiver)
  );
}

function isOfficeAddress(value: unknown): boolean {
  return (
    isFields(value) &&
    isFields(value.city) &&
    typeof value.city.id === 'number' &&
    typeof value.city.name === 'string' &&
    (value.city.postCode === null || typeof value.city.postCode === 'string') &&
    typeof value.fullAddress === 'string' &&
    (value.location === null || isLocation(value.location))
  );
}

function isServingOffice(value: unknown): boolean {
  return (
    isFields(value) &&
    typeof value.officeCode === 'string' &&
    typeof value.servingType === 'string'
  );
}

function isLocation(value: unknown): boolean {
  return (
    isFields(value) &&
    typeof value.latitude === 'number' &&
    typeof value.longitude === 'number'
  );
}

function isStringOrNull(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function isNumberOrNull(value: unknown): boolean {
  return value === null || typeof value === 'number';
}

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null;
}
