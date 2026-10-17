import { Test } from '@nestjs/testing';
import {
  ArticleInventoryDetailDto,
  DeliveryMethod,
  DeliveryOfficeDto,
  DeliveryDestinationDto,
  DeliveryDestinationType,
  DeliveryPlaceDto,
  DeliveryOfficeType,
  DeliveryAddressValidationStatus,
  PlaceOrderDeliveryDto,
  ShippingMethod,
} from '@vp-parts-shop/shared';
import type { CartShippingLine, ResolvedShippingProfile } from '../cart';
import type { AvailabilityByArticle } from '../inventory';
import { RedisCache } from '../redis';
import { DELIVERY_CARRIERS } from './delivery-carrier';
import {
  DeliveryAddressNotServedException,
  DeliveryAddressRefusedException,
  DeliveryLockerIneligibleException,
  DeliveryOfficeNotFoundException,
} from './delivery.exceptions';
import { DeliveryService } from './delivery.service';
import type { DeliveryTerms } from './delivery.service';
import type { LockerLimits } from './parcel/locker-fit';

const ECONTOMAT: LockerLimits = {
  maxSidesCm: [61, 44, 37],
  maxWeightGrams: 20_000,
  fillFactor: 0.8,
};

function officeTo(officeCode: string): DeliveryDestinationDto {
  return { type: DeliveryDestinationType.OFFICE, officeCode };
}

function addressTo(placeId: string): DeliveryDestinationDto {
  return {
    type: DeliveryDestinationType.ADDRESS,
    address: { ...SOFIA_ADDRESS, placeId },
  };
}

const SOFIA_ADDRESS = {
  placeId: '27183',
  street: 'бул. Витоша',
  streetNumber: '10',
};

function toOffice(
  officeCode: string,
  carrier = ShippingMethod.ECONT,
): PlaceOrderDeliveryDto {
  return { method: DeliveryMethod.COURIER_OFFICE, carrier, officeCode };
}

function toAddress(placeId: string): PlaceOrderDeliveryDto {
  return {
    method: DeliveryMethod.COURIER_ADDRESS,
    carrier: ShippingMethod.ECONT,
    address: { ...SOFIA_ADDRESS, placeId },
  };
}

const QUOTE: DeliveryTerms = { goodsToCollectCents: null, isBinding: false };
const ORDER: DeliveryTerms = { goodsToCollectCents: null, isBinding: true };

const PROFILES: Record<string, ResolvedShippingProfile> = {
  FILTER: {
    weightGrams: 47,
    packageCm: { length: 7.5, width: 7.5, height: 12 },
    isEstimated: false,
  },
  ESTIMATED_FILTER: {
    weightGrams: 47,
    packageCm: { length: 7.5, width: 7.5, height: 12 },
    isEstimated: true,
  },
  PAD: { weightGrams: 2000, packageCm: null, isEstimated: false },
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
    placeId: '9000',
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

function place(carrier: ShippingMethod): DeliveryPlaceDto {
  return {
    carrier,
    id: '27183',
    name: 'Ясен',
    region: 'Плевен',
    postCode: '5850',
    servingOfficeCode: '5817',
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
  listPlaces: jest.Mock;
  listAddressPlaces: jest.Mock;
  findStreets: jest.Mock;
  findQuarters: jest.Mock;
  validateAddress: jest.Mock;
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
    listPlaces: jest.fn().mockResolvedValue([place(carrier)]),
    listAddressPlaces: jest.fn().mockResolvedValue([place(carrier)]),
    findStreets: jest
      .fn()
      .mockResolvedValue([{ id: '1', name: 'бул. Витоша' }]),
    findQuarters: jest
      .fn()
      .mockResolvedValue([{ id: '2', name: 'кв. Слатина' }]),
    validateAddress: jest.fn().mockResolvedValue({
      status: DeliveryAddressValidationStatus.VALID,
      suggested: null,
    }),
    findOffice: jest
      .fn()
      .mockResolvedValue(office(DeliveryOfficeType.OFFICE, carrier)),
    quote: jest.fn().mockResolvedValue({
      priceIncVatCents: 1061,
      cashOnDeliveryFeeIncVatCents: null,
      expectedDeliveryDate: '2026-09-25',
    }),
  };
}

describe('DeliveryService', () => {
  let service: DeliveryService;
  let lines: CartShippingLine[];
  let cached: jest.Mock;
  let econt: FakeCarrier;
  let speedy: FakeCarrier;
  let availability: AvailabilityByArticle;

  function priceTo(delivery: PlaceOrderDeliveryDto, terms = QUOTE) {
    return service.price({ lines, availability }, delivery, terms);
  }

  beforeEach(async () => {
    availability = new Map([
      ['30:FILTER', stocked(5, '2026-09-28T06:00:00Z')],
      ['30:PAD', stocked(5, '2026-09-29T06:00:00Z')],
    ]);
    lines = [line('FILTER'), line('PAD', 2)];
    cached = jest.fn((_key: string, _ttl: number, loader: () => unknown) =>
      loader(),
    );
    econt = fakeCarrier(ShippingMethod.ECONT, ECONTOMAT);
    speedy = fakeCarrier(ShippingMethod.SPEEDY, null);

    const moduleRef = await Test.createTestingModule({
      providers: [
        DeliveryService,
        { provide: DELIVERY_CARRIERS, useValue: [econt, speedy] },
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

  describe('listPlaces', () => {
    it('lists the places of the carrier asked for', async () => {
      const places = await service.listPlaces(ShippingMethod.SPEEDY);

      expect(places).toEqual([place(ShippingMethod.SPEEDY)]);
      expect(econt.listPlaces).not.toHaveBeenCalled();
    });
  });

  describe('address helpers', () => {
    it('lists the places a carrier delivers to', async () => {
      expect(await service.listAddressPlaces(ShippingMethod.SPEEDY)).toEqual([
        place(ShippingMethod.SPEEDY),
      ]);
      expect(econt.listAddressPlaces).not.toHaveBeenCalled();
    });

    it('suggests streets and quarters from the carrier asked for', async () => {
      await service.findStreets(ShippingMethod.ECONT, '41', 'вит');
      await service.findQuarters(ShippingMethod.ECONT, '41', 'сла');

      expect(econt.findStreets).toHaveBeenCalledWith('41', 'вит');
      expect(econt.findQuarters).toHaveBeenCalledWith('41', 'сла');
    });

    it('validates an address with the carrier asked for', async () => {
      const address = {
        placeId: '41',
        street: 'бул. Витоша',
        streetNumber: '1',
      };

      await service.validateAddress(ShippingMethod.ECONT, address);

      expect(econt.validateAddress).toHaveBeenCalledWith(address);
    });
  });

  describe('estimateParcel', () => {
    it('weighs the lines by the profile the cart stored for each', () => {
      expect(service.estimateParcel(lines, ShippingMethod.ECONT)).toEqual({
        weightGrams: 47 + 2000 * 2,
        isLockerEligible: false,
      });
    });

    it('lets a parcel that fits a cell go to the carrier locker', () => {
      const parcel = service.estimateParcel(
        [line('FILTER')],
        ShippingMethod.ECONT,
      );

      expect(parcel.isLockerEligible).toBe(true);
    });

    it('keeps a parcel holding an estimated line out of the locker, however small', () => {
      const parcel = service.estimateParcel(
        [line('FILTER'), line('ESTIMATED_FILTER')],
        ShippingMethod.ECONT,
      );

      expect(parcel).toEqual({ weightGrams: 94, isLockerEligible: false });
    });

    it('never offers a locker for a carrier without lockers', () => {
      const parcel = service.estimateParcel(
        [line('FILTER')],
        ShippingMethod.SPEEDY,
      );

      expect(parcel.isLockerEligible).toBe(false);
    });
  });

  describe('price', () => {
    it('prices the parcel to the office and names the office', async () => {
      const result = await priceTo(toOffice('9035'));

      expect(econt.quote).toHaveBeenCalledWith(officeTo('9035'), {
        parcel: expect.objectContaining({ weightGrams: 4047 }),
        sendDate: '2026-09-29',
        cashOnDeliveryCents: null,
      });
      expect(result).toEqual({
        method: DeliveryMethod.COURIER_OFFICE,
        carrier: ShippingMethod.ECONT,
        destination: {
          office: { code: '9035', name: 'Варна', address: 'Варна' },
        },
        deliveryPrice: 1061,
        cashOnDeliveryFee: 0,
        expectedDeliveryDate: '2026-09-25',
        parcelWeightGrams: 4047,
      });
    });

    it('prices, but promises no date, for a parcel the stock cannot complete', async () => {
      availability.delete('30:PAD');

      const result = await priceTo(toOffice('9035'));

      expect(econt.quote).toHaveBeenCalledWith(
        officeTo('9035'),
        expect.objectContaining({ sendDate: null }),
      );
      expect(result.deliveryPrice).toBe(1061);
      expect(result.expectedDeliveryDate).toBeNull();
      expect(cached).toHaveBeenCalledWith(
        'delivery:quote:ECONT:office:9035:4047:nobox:undated:collect:none',
        300,
        expect.any(Function),
      );
    });

    it('finds the office and prices the parcel with the carrier asked for', async () => {
      const result = await priceTo(toOffice('9035', ShippingMethod.SPEEDY));

      expect(speedy.findOffice).toHaveBeenCalledWith('9035');
      expect(speedy.quote).toHaveBeenCalledWith(
        officeTo('9035'),
        expect.objectContaining({ sendDate: '2026-09-29' }),
      );
      expect(econt.findOffice).not.toHaveBeenCalled();
      expect(econt.quote).not.toHaveBeenCalled();
      expect(result.carrier).toBe(ShippingMethod.SPEEDY);
    });

    it('caches a quote for five minutes by carrier, office and parcel', async () => {
      await priceTo(toOffice('9035'));

      expect(cached).toHaveBeenCalledWith(
        'delivery:quote:ECONT:office:9035:4047:nobox:2026-09-29:collect:none',
        300,
        expect.any(Function),
      );
    });

    it('keys a single-unit quote on its box, which the courier prices', async () => {
      lines = [line('FILTER')];

      await priceTo(toOffice('9035'));

      expect(cached).toHaveBeenCalledWith(
        'delivery:quote:ECONT:office:9035:47:7.5x7.5x12:2026-09-28:collect:none',
        300,
        expect.any(Function),
      );
    });

    it('refuses an office the carrier does not list', async () => {
      econt.findOffice.mockResolvedValueOnce(undefined);

      await expect(priceTo(toOffice('0000'))).rejects.toBeInstanceOf(
        DeliveryOfficeNotFoundException,
      );
      expect(econt.quote).not.toHaveBeenCalled();
    });

    it('refuses a locker for a parcel that cannot be shown to fit', async () => {
      econt.findOffice.mockResolvedValueOnce(office(DeliveryOfficeType.LOCKER));

      await expect(priceTo(toOffice('9010'))).rejects.toBeInstanceOf(
        DeliveryLockerIneligibleException,
      );
    });

    it('prices a locker for a parcel that fits one', async () => {
      econt.findOffice.mockResolvedValueOnce(office(DeliveryOfficeType.LOCKER));
      lines = [line('FILTER')];

      await priceTo(toOffice('9010'));

      expect(econt.quote).toHaveBeenCalledWith(
        officeTo('9010'),
        expect.objectContaining({ sendDate: '2026-09-28' }),
      );
    });

    it('refuses a locker for a parcel holding an estimated line', async () => {
      econt.findOffice.mockResolvedValueOnce(office(DeliveryOfficeType.LOCKER));
      lines = [line('ESTIMATED_FILTER')];

      await expect(priceTo(toOffice('9010'))).rejects.toBeInstanceOf(
        DeliveryLockerIneligibleException,
      );
      expect(econt.quote).not.toHaveBeenCalled();
    });

    it('prices an office for a parcel holding an estimated line', async () => {
      lines = [line('ESTIMATED_FILTER')];

      const result = await priceTo(toOffice('9035'));

      expect(result.parcelWeightGrams).toBe(47);
    });

    it('charges nothing for pickup, asks no carrier, and dates it by the slowest part', async () => {
      const result = await priceTo({ method: DeliveryMethod.STORE_PICKUP });

      expect(result).toEqual({
        method: DeliveryMethod.STORE_PICKUP,
        carrier: null,
        destination: null,
        deliveryPrice: 0,
        cashOnDeliveryFee: 0,
        expectedDeliveryDate: '2026-09-29',
        parcelWeightGrams: null,
      });
      expect(econt.quote).not.toHaveBeenCalled();
    });

    describe('cash on delivery', () => {
      const GOODS = 36;

      function priceCollectingCash() {
        return priceTo(toOffice('9035'), {
          goodsToCollectCents: GOODS,
          isBinding: false,
        });
      }

      beforeEach(() => {
        econt.quote
          .mockResolvedValueOnce({
            priceIncVatCents: 1061,
            cashOnDeliveryFeeIncVatCents: 5,
            expectedDeliveryDate: '2026-09-25',
          })
          .mockResolvedValueOnce({
            priceIncVatCents: 1061,
            cashOnDeliveryFeeIncVatCents: 17,
            expectedDeliveryDate: '2026-09-25',
          });
      });

      it('asks the fee on the parts, then on everything the courier collects', async () => {
        await priceCollectingCash();

        expect(econt.quote).toHaveBeenNthCalledWith(1, officeTo('9035'), {
          parcel: expect.objectContaining({ weightGrams: 4047 }),
          sendDate: '2026-09-29',
          cashOnDeliveryCents: GOODS,
        });
        expect(econt.quote).toHaveBeenNthCalledWith(
          2,
          officeTo('9035'),
          expect.objectContaining({ cashOnDeliveryCents: GOODS + 1061 + 5 }),
        );
      });

      it('answers the delivery and the fee charged on the whole amount, apart', async () => {
        const result = await priceCollectingCash();

        expect(result.deliveryPrice).toBe(1061);
        expect(result.cashOnDeliveryFee).toBe(17);
      });

      it('caches each price by the amount collected', async () => {
        await priceCollectingCash();

        expect(cached).toHaveBeenCalledWith(
          'delivery:quote:ECONT:office:9035:4047:nobox:2026-09-29:collect:36',
          300,
          expect.any(Function),
        );
        expect(cached).toHaveBeenCalledWith(
          'delivery:quote:ECONT:office:9035:4047:nobox:2026-09-29:collect:1102',
          300,
          expect.any(Function),
        );
      });

      it('asks once, collecting nothing, when the customer pays otherwise', async () => {
        await priceTo(toOffice('9035'));

        expect(econt.quote).toHaveBeenCalledTimes(1);
        expect(econt.quote.mock.calls[0][1].cashOnDeliveryCents).toBeNull();
      });
    });

    describe('to an address', () => {
      it('prices the parcel to a place the carrier delivers to, naming the place', async () => {
        const result = await priceTo(toAddress('27183'));

        expect(econt.quote).toHaveBeenCalledWith(addressTo('27183'), {
          parcel: expect.objectContaining({ weightGrams: 4047 }),
          sendDate: '2026-09-29',
          cashOnDeliveryCents: null,
        });
        expect(econt.findOffice).not.toHaveBeenCalled();
        expect(result.destination).toEqual({
          address: { ...SOFIA_ADDRESS, city: 'Ясен', postCode: '5850' },
        });
      });

      it('refuses a place the carrier does not deliver to, before asking it for a price', async () => {
        await expect(priceTo(toAddress('999999'))).rejects.toBeInstanceOf(
          DeliveryAddressNotServedException,
        );
        expect(econt.quote).not.toHaveBeenCalled();
      });

      it('caches the quote by place, so the street never splits it', async () => {
        await priceTo(toAddress('27183'));

        expect(cached).toHaveBeenCalledWith(
          'delivery:quote:ECONT:place:27183:4047:nobox:2026-09-29:collect:none',
          300,
          expect.any(Function),
        );
      });

      it('leaves the address to the customer’s own check while only quoting', async () => {
        await priceTo(toAddress('27183'));

        expect(econt.validateAddress).not.toHaveBeenCalled();
      });

      it('checks the address with the carrier for an order', async () => {
        await priceTo(toAddress('27183'), ORDER);

        expect(econt.validateAddress).toHaveBeenCalledWith(SOFIA_ADDRESS);
      });

      it('asks the carrier about the address while it prices the delivery', async () => {
        let releaseQuote!: () => void;
        econt.quote.mockReturnValueOnce(
          new Promise((resolve) => {
            releaseQuote = () =>
              resolve({
                priceIncVatCents: 1061,
                cashOnDeliveryFeeIncVatCents: null,
                expectedDeliveryDate: '2026-10-01',
              });
          }),
        );

        const pricing = priceTo(toAddress('27183'), ORDER);
        await new Promise(setImmediate);

        expect(econt.validateAddress).toHaveBeenCalledWith(SOFIA_ADDRESS);
        releaseQuote();
        await expect(pricing).resolves.toMatchObject({ deliveryPrice: 1061 });
      });

      it('accepts an address the carrier only corrected', async () => {
        econt.validateAddress.mockResolvedValueOnce({
          status: DeliveryAddressValidationStatus.UNCERTAIN,
          suggested: SOFIA_ADDRESS,
        });

        await expect(priceTo(toAddress('27183'), ORDER)).resolves.toMatchObject(
          { deliveryPrice: 1061 },
        );
      });

      it('refuses an address the carrier refuses', async () => {
        econt.validateAddress.mockResolvedValueOnce({
          status: DeliveryAddressValidationStatus.INVALID,
          suggested: null,
        });

        await expect(priceTo(toAddress('27183'), ORDER)).rejects.toBeInstanceOf(
          DeliveryAddressRefusedException,
        );
      });
    });
  });
});
