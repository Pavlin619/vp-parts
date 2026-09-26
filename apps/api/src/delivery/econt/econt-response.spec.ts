import {
  EcontError,
  EcontOfficeRecord,
  isCalculatedLabel,
  isOfficeRecord,
  refusesReceiver,
} from './econt-response';

/** The tree the demo answers for an unknown office, measured; `side` is its prefix. */
function refusalOf(side: string): EcontError {
  return {
    type: 'ExInvalidParam',
    message: ' ',
    innerErrors: [
      {
        type: 'ExInvalidParam',
        message: `${side}: `,
        innerErrors: [
          {
            type: 'ExInvalidCity',
            message: 'Невалиднo населено място.',
            innerErrors: [],
          },
        ],
      },
    ],
  };
}

function office(): EcontOfficeRecord {
  return {
    code: '1127',
    name: 'София',
    isAPS: false,
    isMPS: false,
    isDrive: false,
    address: {
      city: { name: 'София', postCode: '1000' },
      fullAddress: 'София ул. Резбарска №11',
      location: { latitude: 42.7155, longitude: 23.3594 },
    },
    normalBusinessHoursFrom: 1,
    normalBusinessHoursTo: 2,
    halfDayBusinessHoursFrom: null,
    halfDayBusinessHoursTo: null,
  };
}

describe('isOfficeRecord', () => {
  it('accepts an office carrying every field we read', () => {
    expect(isOfficeRecord(office())).toBe(true);
  });

  it('accepts the fields Econt leaves null', () => {
    const record = office();
    record.address.city.postCode = null;
    record.address.location = null;
    record.normalBusinessHoursFrom = null;

    expect(isOfficeRecord(record)).toBe(true);
  });

  it.each([
    ['not an object', null],
    ['no code', { ...office(), code: undefined }],
    ['a numeric code', { ...office(), code: 1127 }],
    ['no address', { ...office(), address: undefined }],
    ['no city', { ...office(), address: { ...office().address, city: null } }],
    [
      'a location without coordinates',
      { ...office(), address: { ...office().address, location: {} } },
    ],
    ['hours as text', { ...office(), normalBusinessHoursFrom: '09:00' }],
    ['no locker flag', { ...office(), isAPS: undefined }],
    ['no drive-through flag', { ...office(), isDrive: undefined }],
  ])('refuses %s', (_case, record) => {
    expect(isOfficeRecord(record)).toBe(false);
  });
});

describe('isCalculatedLabel', () => {
  const label = { totalPrice: 4.13, currency: 'EUR', expectedDeliveryDate: 1 };

  it('accepts a priced label, with or without a delivery date', () => {
    expect(isCalculatedLabel({ label })).toBe(true);
    expect(
      isCalculatedLabel({ label: { ...label, expectedDeliveryDate: null } }),
    ).toBe(true);
  });

  it.each([
    ['no label', {}],
    ['a price as text', { label: { ...label, totalPrice: '4.13' } }],
    ['a negative price', { label: { ...label, totalPrice: -1 } }],
    ['a price that is not a number', { label: { ...label, totalPrice: NaN } }],
    ['no currency', { label: { ...label, currency: undefined } }],
    [
      'a date as text',
      { label: { ...label, expectedDeliveryDate: '2026-09-25' } },
    ],
  ])('refuses %s', (_case, body) => {
    expect(isCalculatedLabel(body)).toBe(false);
  });
});

describe('refusesReceiver', () => {
  it('recognises a refusal of the receiving office', () => {
    expect(refusesReceiver(refusalOf('получател'))).toBe(true);
  });

  it('does not blame the receiver for a refused sender', () => {
    expect(refusesReceiver(refusalOf('подател'))).toBe(false);
  });

  it('does not blame the receiver for a refusal naming no side', () => {
    expect(
      refusesReceiver({
        type: 'ExAccessDenied',
        message: 'Невалидно потребителско име и/или парола.',
      }),
    ).toBe(false);
  });
});
