import type { ConfigService } from '@nestjs/config';
import { DeliveryOfficeType, ShippingMethod } from '@vp-parts-shop/shared';
import type { Parcel } from '../parcel/parcel-estimate';
import { EcontCarrier } from './econt.carrier';
import type { EcontOffices } from './econt-offices';
import type { EcontQuotes } from './econt-quotes';

const CONFIG: Record<string, string> = {
  ECONT_LOCKER_MAX_CM: '61,44,37',
  ECONT_LOCKER_MAX_WEIGHT_GRAMS: '20000',
  ECONT_LOCKER_FILL_FACTOR: '0.8',
};

const PARCEL: Parcel = {
  weightGrams: 1000,
  unitsCm: null,
};

describe('EcontCarrier', () => {
  const office = { code: '9035', type: DeliveryOfficeType.OFFICE };
  const offices = {
    list: jest.fn().mockResolvedValue([office]),
    find: jest.fn().mockResolvedValue(office),
  };
  const quotes = {
    quote: jest
      .fn()
      .mockResolvedValue({ priceIncVatCents: 413, expectedDeliveryDate: null }),
  };
  const carrier = new EcontCarrier(
    offices as unknown as EcontOffices,
    quotes as unknown as EcontQuotes,
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

  it('prices a parcel with an Econt quote', async () => {
    await expect(carrier.quote('9035', PARCEL, '2026-09-28')).resolves.toEqual({
      priceIncVatCents: 413,
      expectedDeliveryDate: null,
    });
    expect(quotes.quote).toHaveBeenCalledWith('9035', PARCEL, '2026-09-28');
  });
});
