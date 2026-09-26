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
    city: { name: string; postCode: string | null };
    fullAddress: string;
    location: { latitude: number; longitude: number } | null;
  };
  normalBusinessHoursFrom: number | null;
  normalBusinessHoursTo: number | null;
  halfDayBusinessHoursFrom: number | null;
  halfDayBusinessHoursTo: number | null;
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
    typeof value.city.name === 'string' &&
    (value.city.postCode === null || typeof value.city.postCode === 'string') &&
    typeof value.fullAddress === 'string' &&
    (value.location === null || isLocation(value.location))
  );
}

function isLocation(value: unknown): boolean {
  return (
    isFields(value) &&
    typeof value.latitude === 'number' &&
    typeof value.longitude === 'number'
  );
}

function isNumberOrNull(value: unknown): boolean {
  return value === null || typeof value === 'number';
}

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null;
}
