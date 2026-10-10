import type { ConfigService } from '@nestjs/config';
import {
  DeliveryDestinationType,
  DeliveryOfficeType,
  ShippingMethod,
} from '@vp-parts-shop/shared';
import type { Parcel } from '../parcel/parcel-estimate';
import { EcontCarrier } from './econt.carrier';
import type { EcontAddresses } from './econt-addresses';
import type { EcontOffices } from './econt-offices';
import type { EcontPlaces } from './econt-places';
import type { EcontQuotes } from './econt-quotes';

const CONFIG: Record<string, string> = {
  ECONT_LOCKER_MAX_CM: '61,44,37',
  ECONT_LOCKER_MAX_WEIGHT_GRAMS: '20000',
  ECONT_LOCKER_FILL_FACTOR: '0.8',
};

const PARCEL: Parcel = {
  weightGrams: 1000,
  unitsCm: null,
  hasEstimatedUnits: false,
};

describe('EcontCarrier', () => {
  const office = { code: '9035', type: DeliveryOfficeType.OFFICE };
  const offices = {
    list: jest.fn().mockResolvedValue([office]),
    find: jest.fn().mockResolvedValue(office),
  };
  const place = { id: '27183', servingOfficeCode: '5817' };
  const places = {
    list: jest.fn().mockResolvedValue([place]),
    listForAddress: jest.fn().mockResolvedValue([place]),
  };
  const addresses = {
    streets: jest.fn().mockResolvedValue([{ id: '1', name: 'бул. Витоша' }]),
    quarters: jest.fn().mockResolvedValue([{ id: '2', name: 'кв. Слатина' }]),
    validate: jest.fn().mockResolvedValue({ status: 'VALID', suggested: null }),
  };
  const quotes = {
    quote: jest
      .fn()
      .mockResolvedValue({ priceIncVatCents: 413, expectedDeliveryDate: null }),
  };
  const carrier = new EcontCarrier(
    offices as unknown as EcontOffices,
    places as unknown as EcontPlaces,
    quotes as unknown as EcontQuotes,
    addresses as unknown as EcontAddresses,
    { get: (key: string) => CONFIG[key] } as unknown as ConfigService,
  );

  it('answers for Econt', () => {
    expect(carrier.carrier).toBe(ShippingMethod.ECONT);
  });

  it('reads the Econtomat cell limits from config', () => {
    expect(carrier.lockerLimits).toEqual({
      maxSidesCm: [61, 44, 37],
      maxWeightGrams: 20_000,
      fillFactor: 0.8,
    });
  });

  it('lists and finds offices from the Econt office list', async () => {
    await expect(carrier.listOffices()).resolves.toEqual([office]);
    await expect(carrier.findOffice('9035')).resolves.toBe(office);
    expect(offices.find).toHaveBeenCalledWith('9035');
  });

  it('lists places from the Econt place list', async () => {
    await expect(carrier.listPlaces()).resolves.toEqual([place]);
  });

  it('lists the address places from the Econt door-served places', async () => {
    await expect(carrier.listAddressPlaces()).resolves.toEqual([place]);
    expect(places.listForAddress).toHaveBeenCalled();
  });

  it('suggests streets and quarters from the Econt address lists', async () => {
    await expect(carrier.findStreets('41', 'вит')).resolves.toEqual([
      { id: '1', name: 'бул. Витоша' },
    ]);
    await expect(carrier.findQuarters('41', 'сла')).resolves.toEqual([
      { id: '2', name: 'кв. Слатина' },
    ]);
    expect(addresses.streets).toHaveBeenCalledWith('41', 'вит');
    expect(addresses.quarters).toHaveBeenCalledWith('41', 'сла');
  });

  it('validates an address with Econt', async () => {
    const address = { placeId: '41', street: 'бул. Витоша', streetNumber: '1' };

    await expect(carrier.validateAddress(address)).resolves.toEqual({
      status: 'VALID',
      suggested: null,
    });
    expect(addresses.validate).toHaveBeenCalledWith(address);
  });

  it('prices a parcel with an Econt quote', async () => {
    const destination = {
      type: DeliveryDestinationType.OFFICE,
      officeCode: '9035',
    } as const;

    await expect(
      carrier.quote(destination, PARCEL, '2026-09-28'),
    ).resolves.toEqual({
      priceIncVatCents: 413,
      expectedDeliveryDate: null,
    });
    expect(quotes.quote).toHaveBeenCalledWith(
      destination,
      PARCEL,
      '2026-09-28',
    );
  });
});
