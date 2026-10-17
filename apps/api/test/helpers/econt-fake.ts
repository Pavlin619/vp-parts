import { DeliveryDestinationType } from '@vp-parts-shop/shared';

/** A fake Econt transport answering the nomenclatures and quotes the e2e tests read. */
const NINE = new Date('2026-09-24T06:00:00Z').getTime();
export const SIX_PM = new Date('2026-09-24T15:00:00Z').getTime();

function econtOffice(code: string, isAPS: boolean) {
  return {
    code,
    name: isAPS ? 'Варна 24/7 Еконтомат' : 'Варна',
    isAPS,
    isMPS: false,
    isDrive: false,
    address: {
      city: { id: 9000, name: 'Варна', postCode: '9000' },
      fullAddress: 'Варна бул. Сливница 1',
      location: { latitude: 43.2, longitude: 27.9 },
    },
    normalBusinessHoursFrom: NINE,
    normalBusinessHoursTo: SIX_PM,
    halfDayBusinessHoursFrom: null,
    halfDayBusinessHoursTo: null,
  };
}

function econtCity(id: number, name: string, toOfficeCode: string) {
  return {
    id,
    name,
    regionName: 'Варна',
    postCode: String(id),
    servingOffices: [
      { officeCode: toOfficeCode, servingType: 'to_office_courier' },
    ],
  };
}

export function officeTo(officeCode: string) {
  return { type: DeliveryDestinationType.OFFICE, officeCode };
}

export const SOFIA_ID = 41;

export const SOFIA_ADDRESS = {
  placeId: String(SOFIA_ID),
  street: 'бул. Витоша',
  streetNumber: '10',
};

export function addressTo(address: object = SOFIA_ADDRESS) {
  return { type: DeliveryDestinationType.ADDRESS, address };
}

const NOMENCLATURES: Record<string, object> = {
  'Nomenclatures/NomenclaturesService.getOffices': {
    offices: [econtOffice('9035', false), econtOffice('9010', true)],
  },
  'Nomenclatures/NomenclaturesService.getStreets': {
    streets: [
      { id: 1, cityID: SOFIA_ID, name: 'бул. Витоша', nameEn: 'bul. Vitosha' },
      { id: 2, cityID: SOFIA_ID, name: 'ул. Граф Игнатиев', nameEn: 'ul.' },
    ],
  },
  'Nomenclatures/NomenclaturesService.getQuarters': {
    quarters: [
      { id: 210, cityID: SOFIA_ID, name: 'кв. Слатина', nameEn: 'kv. Slatina' },
    ],
  },
  'Nomenclatures/AddressService.validateAddress': {
    validationStatus: 'normal',
    address: { street: 'бул. Витоша', num: '10', quarter: '', other: null },
  },
  'Nomenclatures/NomenclaturesService.getCities': {
    cities: [
      econtCity(9000, 'Варна', '9035'),
      econtCity(9154, 'Константиново', '9035'),
      econtCity(9155, 'Мобилно', '90450'),
      {
        id: SOFIA_ID,
        name: 'София',
        regionName: 'София',
        postCode: '1000',
        servingOffices: [
          { officeCode: '9035', servingType: 'to_door_courier' },
        ],
      },
    ],
  },
};

export const econt = {
  readNomenclature: jest.fn((service: string) =>
    Promise.resolve(NOMENCLATURES[service]),
  ),
  call: jest.fn(() =>
    Promise.resolve({
      label: {
        totalPrice: 4.13,
        currency: 'EUR',
        expectedDeliveryDate: SIX_PM,
      },
    }),
  ),
};
