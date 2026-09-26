import { Test } from '@nestjs/testing';
import {
  ArticleInventoryDetailDto,
  DeliveryOfficeDto,
  DeliveryOfficeType,
  ShippingMethod,
} from '@vp-parts-shop/shared';
import {
  CartEmptyException,
  CartService,
  CartShipping,
  CartShippingLine,
} from '../cart';
import { AvailabilityByArticle, InventoryService } from '../inventory';
import { RedisCache } from '../redis';
import type { ShippingProfile } from '../tecdoc';
import { DELIVERY_CARRIERS } from './delivery-carrier';
import {
  DeliveryLockerIneligibleException,
  DeliveryOfficeNotFoundException,
  DeliveryParcelUnmeasuredException,
} from './delivery.exceptions';
import { DeliveryService } from './delivery.service';
import type { LockerLimits } from './parcel/locker-fit';

const ECONTOMAT: LockerLimits = {
  maxSidesCm: [61, 44, 37],
  maxWeightGrams: 20_000,
  fillFactor: 0.8,
};

const REQUESTER = { clerkId: null, token: 'token' };

const PROFILES: Record<string, ShippingProfile> = {
  FILTER: {
    weightGrams: 47,
    packageCm: { length: 7.5, width: 7.5, height: 12 },
  },
  PAD: { weightGrams: 2000, packageCm: null },
  DISC: { weightGrams: null, packageCm: null },
};

function line(articleNumber: string, quantity = 1): CartShippingLine {
  return {
    article: { brandId: '30', articleNumber },
    quantity,
    shippingProfile: PROFILES[articleNumber],
  };
}

function office(
  type: DeliveryOfficeType,
  carrier = ShippingMethod.ECONT,
): DeliveryOfficeDto {
  return {
    carrier,
    code: type === DeliveryOfficeType.LOCKER ? '9010' : '9035',
    name: 'Варна',
    city: 'Варна',
    postCode: '9000',
    address: 'Варна',
    latitude: 43.2,
    longitude: 27.9,
    type,
    weekdayHours: null,
    saturdayHours: null,
  };
}

function stocked(
  quantity: number,
  pickupAt: string,
): ArticleInventoryDetailDto {
  return {
    available: true,
    bestPriceExVat: 10,
    bestPriceIncVat: 12,
    availabilityByWarehouse: [
      {
        warehouseId: 'REGIONAL_2',
        quantity,
        deliveryWorkDays: 1,
        orderCutoffTime: '17:00',
        cutoffAt: '2026-09-28T14:00:00Z',
        pickup: { earliestAt: pickupAt, granularity: 'DAY' },
        courier: { earliestAt: pickupAt, granularity: 'DAY' },
      },
    ],
    computedAt: '2026-09-28T07:00:00Z',
  };
}

interface FakeCarrier {
  carrier: ShippingMethod;
  lockerLimits: LockerLimits | null;
  listOffices: jest.Mock;
  findOffice: jest.Mock;
  quote: jest.Mock;
}

function fakeCarrier(
  carrier: ShippingMethod,
  lockerLimits: LockerLimits | null,
): FakeCarrier {
  return {
    carrier,
    lockerLimits,
    listOffices: jest
      .fn()
      .mockResolvedValue([office(DeliveryOfficeType.OFFICE, carrier)]),
    findOffice: jest
      .fn()
      .mockResolvedValue(office(DeliveryOfficeType.OFFICE, carrier)),
    quote: jest.fn().mockResolvedValue({
      priceIncVatCents: 1061,
      expectedDeliveryDate: '2026-09-25',
    }),
  };
}

describe('DeliveryService', () => {
  let service: DeliveryService;
  let shipping: CartShipping;
  let cached: jest.Mock;
  let econt: FakeCarrier;
  let speedy: FakeCarrier;
  let availability: AvailabilityByArticle;
  let getAvailability: jest.Mock;

  beforeEach(async () => {
    availability = new Map([
      ['30:FILTER', stocked(5, '2026-09-28T06:00:00Z')],
      ['30:PAD', stocked(5, '2026-09-29T06:00:00Z')],
    ]);
    getAvailability = jest.fn(() => Promise.resolve(availability));
    shipping = {
      cart: { id: 'cart', version: 4, lines: [] },
      lines: [line('FILTER'), line('PAD', 2)],
    };
    cached = jest.fn((_key: string, _ttl: number, loader: () => unknown) =>
      loader(),
    );
    econt = fakeCarrier(ShippingMethod.ECONT, ECONTOMAT);
    speedy = fakeCarrier(ShippingMethod.SPEEDY, null);

    const moduleRef = await Test.createTestingModule({
      providers: [
        DeliveryService,
        {
          provide: CartService,
          useValue: { getShippingLines: () => Promise.resolve(shipping) },
        },
        { provide: DELIVERY_CARRIERS, useValue: [econt, speedy] },
        { provide: InventoryService, useValue: { getAvailability } },
        { provide: RedisCache, useValue: { cached } },
      ],
    }).compile();

    service = moduleRef.get(DeliveryService);
  });

  describe('listOffices', () => {
    it('lists the offices of the carrier asked for', async () => {
      const offices = await service.listOffices(ShippingMethod.SPEEDY);

      expect(offices).toEqual([
        office(DeliveryOfficeType.OFFICE, ShippingMethod.SPEEDY),
      ]);
      expect(econt.listOffices).not.toHaveBeenCalled();
    });

    it('fails loudly for a carrier no adapter is registered for', () => {
      expect(() => service.listOffices('DHL' as ShippingMethod)).toThrow('DHL');
    });
  });

  describe('estimateParcel', () => {
    it('weighs the selected lines by the profile the cart stored for each', async () => {
      const parcel = await service.estimateParcel(
        REQUESTER,
        ShippingMethod.ECONT,
      );

      expect(parcel).toEqual({
        weightGrams: 47 + 2000 * 2,
        unmeasuredArticles: [],
        isLockerEligible: false,
      });
    });

    it('gives no weight for a cart holding a part with none, and names that part', async () => {
      shipping.lines.push(line('DISC'));

      expect(
        await service.estimateParcel(REQUESTER, ShippingMethod.ECONT),
      ).toEqual({
        weightGrams: null,
        unmeasuredArticles: [{ brandId: '30', articleNumber: 'DISC' }],
        isLockerEligible: false,
      });
    });

    it('lets a parcel that fits a cell go to the carrier locker', async () => {
      shipping.lines = [line('FILTER')];

      const parcel = await service.estimateParcel(
        REQUESTER,
        ShippingMethod.ECONT,
      );

      expect(parcel.isLockerEligible).toBe(true);
    });

    it('never offers a locker for a carrier without lockers', async () => {
      shipping.lines = [line('FILTER')];

      const parcel = await service.estimateParcel(
        REQUESTER,
        ShippingMethod.SPEEDY,
      );

      expect(parcel.isLockerEligible).toBe(false);
    });

    it('refuses a cart with nothing selected rather than quote an empty parcel', async () => {
      shipping.lines = [];

      await expect(
        service.estimateParcel(REQUESTER, ShippingMethod.ECONT),
      ).rejects.toBeInstanceOf(CartEmptyException);
    });
  });

  describe('quote', () => {
    it('prices the cart to the office and pins the cart version', async () => {
      const result = await service.quote(REQUESTER, {
        carrier: ShippingMethod.ECONT,
        officeCode: '9035',
      });

      expect(econt.quote).toHaveBeenCalledWith(
        '9035',
        expect.objectContaining({ weightGrams: 4047 }),
        '2026-09-29',
      );
      expect(result).toEqual({
        carrier: ShippingMethod.ECONT,
        officeCode: '9035',
        priceIncVatCents: 1061,
        expectedDeliveryDate: '2026-09-25',
        parcel: {
          weightGrams: 4047,
          unmeasuredArticles: [],
          isLockerEligible: false,
        },
        cartVersion: 4,
      });
    });

    it('hands the courier the parcel on the day its slowest line is at the shop', async () => {
      await service.quote(REQUESTER, {
        carrier: ShippingMethod.ECONT,
        officeCode: '9035',
      });

      expect(getAvailability).toHaveBeenCalledWith([
        { brandId: '30', articleNumber: 'FILTER' },
        { brandId: '30', articleNumber: 'PAD' },
      ]);
      expect(econt.quote.mock.calls[0][2]).toBe('2026-09-29');
    });

    it('prices, but promises no date, for a parcel the stock cannot complete', async () => {
      availability.delete('30:PAD');

      const result = await service.quote(REQUESTER, {
        carrier: ShippingMethod.ECONT,
        officeCode: '9035',
      });

      expect(econt.quote).toHaveBeenCalledWith('9035', expect.anything(), null);
      expect(result.priceIncVatCents).toBe(1061);
      expect(result.expectedDeliveryDate).toBeNull();
      expect(cached).toHaveBeenCalledWith(
        'delivery:quote:ECONT:9035:4047:nobox:undated',
        300,
        expect.any(Function),
      );
    });

    it('finds the office and prices the parcel with the carrier asked for', async () => {
      const result = await service.quote(REQUESTER, {
        carrier: ShippingMethod.SPEEDY,
        officeCode: '9035',
      });

      expect(speedy.findOffice).toHaveBeenCalledWith('9035');
      expect(speedy.quote).toHaveBeenCalledWith(
        '9035',
        expect.anything(),
        '2026-09-29',
      );
      expect(econt.findOffice).not.toHaveBeenCalled();
      expect(econt.quote).not.toHaveBeenCalled();
      expect(result.carrier).toBe(ShippingMethod.SPEEDY);
    });

    it('caches a quote for five minutes by carrier, office and parcel', async () => {
      await service.quote(REQUESTER, {
        carrier: ShippingMethod.ECONT,
        officeCode: '9035',
      });

      expect(cached).toHaveBeenCalledWith(
        'delivery:quote:ECONT:9035:4047:nobox:2026-09-29',
        300,
        expect.any(Function),
      );
    });

    it('keys a single-unit quote on its box, which the courier prices', async () => {
      shipping.lines = [line('FILTER')];

      await service.quote(REQUESTER, {
        carrier: ShippingMethod.ECONT,
        officeCode: '9035',
      });

      expect(cached).toHaveBeenCalledWith(
        'delivery:quote:ECONT:9035:47:7.5x7.5x12:2026-09-28',
        300,
        expect.any(Function),
      );
    });

    it('refuses to price a cart with nothing selected', async () => {
      shipping.lines = [];

      await expect(
        service.quote(REQUESTER, {
          carrier: ShippingMethod.ECONT,
          officeCode: '9035',
        }),
      ).rejects.toBeInstanceOf(CartEmptyException);
      expect(econt.quote).not.toHaveBeenCalled();
    });

    it('refuses to price a parcel holding a part with no weight', async () => {
      shipping.lines.push(line('DISC'));

      await expect(
        service.quote(REQUESTER, {
          carrier: ShippingMethod.ECONT,
          officeCode: '9035',
        }),
      ).rejects.toBeInstanceOf(DeliveryParcelUnmeasuredException);
      expect(econt.quote).not.toHaveBeenCalled();
    });

    it('refuses an office the carrier does not list', async () => {
      econt.findOffice.mockResolvedValueOnce(undefined);

      await expect(
        service.quote(REQUESTER, {
          carrier: ShippingMethod.ECONT,
          officeCode: '0000',
        }),
      ).rejects.toBeInstanceOf(DeliveryOfficeNotFoundException);
      expect(econt.quote).not.toHaveBeenCalled();
    });

    it('refuses a locker for a parcel that cannot be shown to fit', async () => {
      econt.findOffice.mockResolvedValueOnce(office(DeliveryOfficeType.LOCKER));

      await expect(
        service.quote(REQUESTER, {
          carrier: ShippingMethod.ECONT,
          officeCode: '9010',
        }),
      ).rejects.toBeInstanceOf(DeliveryLockerIneligibleException);
    });

    it('prices a locker for a parcel that fits one', async () => {
      econt.findOffice.mockResolvedValueOnce(office(DeliveryOfficeType.LOCKER));
      shipping.lines = [line('FILTER')];

      const result = await service.quote(REQUESTER, {
        carrier: ShippingMethod.ECONT,
        officeCode: '9010',
      });

      expect(econt.quote).toHaveBeenCalledWith(
        '9010',
        expect.anything(),
        '2026-09-28',
      );
      expect(result.parcel.isLockerEligible).toBe(true);
    });
  });
});
