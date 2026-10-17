import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  ArticleInventoryDetailDto,
  DeliveryDestinationType,
  DeliveryMethod,
  PaymentMethod,
  ShippingMethod,
} from '@vp-parts-shop/shared';
import { CartEmptyException, CartService } from '../cart';
import type { CartShipping, CartShippingLine } from '../cart';
import { DeliveryService } from '../delivery';
import type { DeliveryPrice } from '../delivery';
import {
  ArticleUnavailableException,
  InventoryService,
  InventoryUnavailableException,
} from '../inventory';
import { CheckoutService } from './checkout.service';
import { OrderMoneyCalculator } from './order-money.calculator';

const REQUESTER = { clerkId: null, token: 'token' };

const SHIPPING_PROFILE = {
  weightGrams: 2000,
  packageCm: null,
  isEstimated: false,
};

const PARCEL = { weightGrams: 10000, isLockerEligible: false };

function line(articleNumber: string, quantity: number): CartShippingLine {
  return {
    article: { brandId: '30', articleNumber },
    quantity,
    shippingProfile: SHIPPING_PROFILE,
  };
}

function stocked(
  quantity: number,
  bestPriceIncVat: number,
): ArticleInventoryDetailDto {
  return {
    available: quantity > 0,
    bestPriceExVat: null,
    bestPriceIncVat,
    availabilityByWarehouse: [
      {
        warehouseId: 'CENTRAL',
        quantity,
        deliveryWorkDays: 0,
        orderCutoffTime: '17:00',
        cutoffAt: '2026-10-15T14:00:00Z',
        pickup: { earliestAt: '2026-10-15T08:00:00Z', granularity: 'DAY' },
        courier: { earliestAt: '2026-10-16T08:00:00Z', granularity: 'DAY' },
      },
    ],
    computedAt: '2026-10-15T07:00:00Z',
  };
}

const OFFICE_DELIVERY: DeliveryPrice = {
  method: DeliveryMethod.COURIER_OFFICE,
  carrier: ShippingMethod.ECONT,
  destination: {
    office: {
      code: '1127',
      name: 'София',
      address: 'ул. 1',
      weekdayHours: null,
      saturdayHours: null,
    },
  },
  deliveryPrice: 378,
  cashOnDeliveryFee: 81,
  expectedDeliveryDate: '2026-10-17',
  parcelWeightGrams: 10000,
};

/** The worked example in docs/ORDERS.md → "Money". */
const MONEY = {
  goodsTotal: 2598 + 2247,
  deliveryPrice: 378,
  cashOnDeliveryFee: 81,
  total: 5304,
  netAmount: 4420,
  vatAmount: 884,
};

const TO_OFFICE = {
  method: DeliveryMethod.COURIER_OFFICE as const,
  carrier: ShippingMethod.ECONT,
  officeCode: '1127',
};

function quoteRequest(isCashOnDelivery: boolean) {
  return {
    carrier: ShippingMethod.ECONT,
    destination: {
      type: DeliveryDestinationType.OFFICE as const,
      officeCode: '1127',
    },
    isCashOnDelivery,
  };
}

const ORDER_TERMS = {
  delivery: TO_OFFICE,
  paymentMethod: PaymentMethod.CASH_ON_DELIVERY as const,
};

describe('CheckoutService', () => {
  let service: CheckoutService;
  let shipping: CartShipping;

  const getShippingLines = jest.fn();
  const getAvailability = jest.fn();
  const price = jest.fn();
  const estimateParcel = jest.fn();

  beforeEach(async () => {
    jest.resetAllMocks();
    shipping = {
      cart: { id: 'cart', version: 7, lines: [] },
      lines: [line('DISC', 2), line('PAD', 3)],
    };
    getShippingLines.mockImplementation(() => Promise.resolve(shipping));
    getAvailability.mockResolvedValue(
      new Map([
        ['30:DISC', stocked(5, 1299)],
        ['30:PAD', stocked(5, 749)],
      ]),
    );
    price.mockResolvedValue(OFFICE_DELIVERY);
    estimateParcel.mockReturnValue(PARCEL);

    const moduleRef = await Test.createTestingModule({
      providers: [
        CheckoutService,
        { provide: CartService, useValue: { getShippingLines } },
        { provide: InventoryService, useValue: { getAvailability } },
        { provide: DeliveryService, useValue: { price, estimateParcel } },
        OrderMoneyCalculator,
        { provide: ConfigService, useValue: { getOrThrow: () => 0.2 } },
      ],
    }).compile();

    service = moduleRef.get(CheckoutService);
  });

  function unorderablePad() {
    getAvailability.mockResolvedValue(
      new Map([
        ['30:DISC', stocked(5, 1299)],
        ['30:PAD', stocked(1, 749)],
      ]),
    );
  }

  describe('totals', () => {
    it('totals the selected lines at their live gross prices, with the VAT taken out once', async () => {
      const totals = await service.totals(REQUESTER);

      expect(totals).toEqual({
        cartVersion: 7,
        goodsTotal: 2 * 1299 + 3 * 749,
        netAmount: 4038,
        vatAmount: 807,
        total: 4845,
      });
      expect(getAvailability).toHaveBeenCalledWith([
        { brandId: '30', articleNumber: 'DISC' },
        { brandId: '30', articleNumber: 'PAD' },
      ]);
    });

    it('leaves out a line no order could include', async () => {
      unorderablePad();

      const totals = await service.totals(REQUESTER);

      expect(totals.goodsTotal).toBe(2 * 1299);
      expect(totals.total).toBe(2 * 1299);
    });

    it('is zero for a cart with nothing selected', async () => {
      shipping = { cart: { id: '', version: 0, lines: [] }, lines: [] };

      const totals = await service.totals(REQUESTER);

      expect(totals).toEqual({
        cartVersion: 0,
        goodsTotal: 0,
        netAmount: 0,
        vatAmount: 0,
        total: 0,
      });
    });

    it('fails closed when the stock cannot be read', async () => {
      getAvailability.mockRejectedValue(new InventoryUnavailableException());

      await expect(service.totals(REQUESTER)).rejects.toBeInstanceOf(
        InventoryUnavailableException,
      );
    });
  });

  describe('estimateParcel', () => {
    it('weighs the selected lines for the carrier asked for', async () => {
      const parcel = await service.estimateParcel(
        REQUESTER,
        ShippingMethod.ECONT,
      );

      expect(parcel).toBe(PARCEL);
      expect(estimateParcel).toHaveBeenCalledWith(
        shipping.lines,
        ShippingMethod.ECONT,
      );
    });

    it('refuses a cart with nothing selected rather than weigh an empty parcel', async () => {
      shipping.lines = [];

      await expect(
        service.estimateParcel(REQUESTER, ShippingMethod.ECONT),
      ).rejects.toBeInstanceOf(CartEmptyException);
    });
  });

  describe('quote', () => {
    it('answers the delivery, its parcel, the cart version it priced, and the whole money', async () => {
      const result = await service.quote(REQUESTER, quoteRequest(true));

      expect(result).toEqual({
        carrier: ShippingMethod.ECONT,
        destination: quoteRequest(true).destination,
        priceIncVatCents: 378,
        cashOnDeliveryFeeIncVatCents: 81,
        expectedDeliveryDate: '2026-10-17',
        parcel: PARCEL,
        cartVersion: 7,
        money: MONEY,
      });
    });

    it('asks the courier to collect the parts when it collects cash', async () => {
      await service.quote(REQUESTER, quoteRequest(true));

      expect(price).toHaveBeenCalledWith(
        { lines: shipping.lines, availability: expect.any(Map) },
        TO_OFFICE,
        { goodsToCollectCents: 2598 + 2247, isBinding: false },
      );
    });

    it('collects nothing, and shows no fee, when the customer pays otherwise', async () => {
      price.mockResolvedValue({ ...OFFICE_DELIVERY, cashOnDeliveryFee: 0 });

      const result = await service.quote(REQUESTER, quoteRequest(false));

      expect(price).toHaveBeenCalledWith(expect.anything(), TO_OFFICE, {
        goodsToCollectCents: null,
        isBinding: false,
      });
      expect(result.cashOnDeliveryFeeIncVatCents).toBeNull();
    });

    it('prices a door delivery to the address asked for', async () => {
      const address = {
        placeId: '41',
        street: 'бул. Витоша',
        streetNumber: '1',
      };

      await service.quote(REQUESTER, {
        carrier: ShippingMethod.ECONT,
        destination: { type: DeliveryDestinationType.ADDRESS, address },
        isCashOnDelivery: false,
      });

      expect(price).toHaveBeenCalledWith(
        expect.anything(),
        {
          method: DeliveryMethod.COURIER_ADDRESS,
          carrier: ShippingMethod.ECONT,
          address,
        },
        expect.anything(),
      );
    });

    it('prices the delivery, but carries no money, while a selected line cannot be ordered', async () => {
      unorderablePad();

      const result = await service.quote(REQUESTER, quoteRequest(false));

      expect(result.priceIncVatCents).toBe(378);
      expect(result.money).toBeNull();
    });

    it('refuses cash on delivery for a cart holding a part no order could be placed for', async () => {
      unorderablePad();

      await expect(
        service.quote(REQUESTER, quoteRequest(true)),
      ).rejects.toBeInstanceOf(ArticleUnavailableException);
      expect(price).not.toHaveBeenCalled();
    });

    it('refuses to price a cart with nothing selected', async () => {
      shipping.lines = [];

      await expect(
        service.quote(REQUESTER, quoteRequest(false)),
      ).rejects.toBeInstanceOf(CartEmptyException);
      expect(price).not.toHaveBeenCalled();
    });
  });

  describe('priceOrder', () => {
    it('prices every line, the delivery and the money', async () => {
      const result = await service.priceOrder(shipping.lines, ORDER_TERMS);

      expect(result).toEqual({
        lines: [
          { ...line('DISC', 2), unitPrice: 1299 },
          { ...line('PAD', 3), unitPrice: 749 },
        ],
        delivery: OFFICE_DELIVERY,
        money: MONEY,
      });
    });

    it('charges exactly what the quote showed for the same cart and choice', async () => {
      const quoted = await service.quote(REQUESTER, quoteRequest(true));
      const ordered = await service.priceOrder(shipping.lines, ORDER_TERMS);

      expect(ordered.money).toEqual(quoted.money);
      expect(price.mock.calls[1][2]).toEqual({
        ...price.mock.calls[0][2],
        isBinding: true,
      });
    });

    it('prices the delivery as binding, so the carrier checks the address', async () => {
      await service.priceOrder(shipping.lines, ORDER_TERMS);

      expect(price).toHaveBeenCalledWith(expect.anything(), TO_OFFICE, {
        goodsToCollectCents: 2598 + 2247,
        isBinding: true,
      });
    });

    it('charges nothing for pickup but the parts', async () => {
      price.mockResolvedValue({
        ...OFFICE_DELIVERY,
        method: DeliveryMethod.STORE_PICKUP,
        carrier: null,
        destination: null,
        deliveryPrice: 0,
        cashOnDeliveryFee: 0,
        parcelWeightGrams: null,
      });

      const { money } = await service.priceOrder(shipping.lines, {
        ...ORDER_TERMS,
        delivery: { method: DeliveryMethod.STORE_PICKUP },
      });

      expect(money).toEqual(
        expect.objectContaining({ total: 4845, vatAmount: 807 }),
      );
    });

    it('refuses a line the stock no longer covers, before asking the courier', async () => {
      unorderablePad();

      await expect(
        service.priceOrder(shipping.lines, ORDER_TERMS),
      ).rejects.toBeInstanceOf(ArticleUnavailableException);
      expect(price).not.toHaveBeenCalled();
    });

    it('refuses a cart with nothing selected', async () => {
      await expect(service.priceOrder([], ORDER_TERMS)).rejects.toBeInstanceOf(
        CartEmptyException,
      );
      expect(getAvailability).not.toHaveBeenCalled();
    });

    it('fails closed when the stock cannot be read', async () => {
      getAvailability.mockRejectedValue(new InventoryUnavailableException());

      await expect(
        service.priceOrder(shipping.lines, ORDER_TERMS),
      ).rejects.toBeInstanceOf(InventoryUnavailableException);
    });
  });
});
