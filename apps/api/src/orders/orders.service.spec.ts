import { Test } from '@nestjs/testing';
import {
  CustomerRole,
  DeliveryMethod,
  PaymentMethod,
  PlaceOrderRequestDto,
  ShippingMethod,
} from '@vp-parts-shop/shared';
import { CartService, CartStaleException } from '../cart';
import type { CartForOrder } from '../cart';
import { CheckoutService } from '../checkout';
import {
  CustomerDetailsRequiredException,
  CustomersService,
} from '../customers';
import type { DeliveryPrice } from '../delivery';
import { ArticleUnavailableException } from '../inventory';
import {
  OrderCartNotFoundException,
  OrderNotFoundException,
  PriceChangedException,
} from './orders.exceptions';
import { OrdersRepository } from './orders.repository';
import { OrdersService, TERMS_VERSION } from './orders.service';

const CLERK_ID = 'clerk-1';
const CART_ID = '7b0c2f4e-35a4-4f43-8f4c-6d1b1d3c2a10';

const PROFILE = {
  id: 'customer-1',
  email: 'ivan@example.com',
  firstName: 'Иван',
  lastName: 'Петров',
  phoneNumber: '+359888123456',
  role: CustomerRole.CUSTOMER,
  createdAt: '2026-10-01T00:00:00.000Z',
};

const SHIPPING_PROFILE = {
  weightGrams: 2000,
  packageCm: null,
  isEstimated: false,
};

function cartLine(articleNumber: string, quantity: number) {
  return {
    article: { brandId: '30', articleNumber },
    quantity,
    shippingProfile: SHIPPING_PROFILE,
    brandName: 'BOSCH',
    description: `Част ${articleNumber}`,
    thumbnailUrl: `https://images.example/${articleNumber}.jpg`,
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
  goodsTotal: 4845,
  deliveryPrice: 378,
  cashOnDeliveryFee: 81,
  total: 5304,
  netAmount: 4420,
  vatAmount: 884,
};

const EXPECTED_TOTAL = MONEY.total;

function request(
  overrides: Partial<PlaceOrderRequestDto> = {},
): PlaceOrderRequestDto {
  return {
    cartId: CART_ID,
    cartVersion: 7,
    expectedTotalCents: EXPECTED_TOTAL,
    paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
    delivery: {
      method: DeliveryMethod.COURIER_OFFICE,
      carrier: ShippingMethod.ECONT,
      officeCode: '1127',
    },
    ...overrides,
  };
}

describe('OrdersService', () => {
  let service: OrdersService;
  let cart: CartForOrder;

  const requireCompleteProfile = jest.fn();
  const findByClerkId = jest.fn();
  const findOwnedCart = jest.fn();
  const priceOrder = jest.fn();
  const place = jest.fn();
  const findReference = jest.fn();
  const findOwned = jest.fn();

  beforeEach(async () => {
    jest.resetAllMocks();
    cart = {
      id: CART_ID,
      version: 7,
      status: 'ACTIVE',
      orderId: null,
      lines: [cartLine('DISC', 2), cartLine('PAD', 3)],
    };
    requireCompleteProfile.mockResolvedValue(PROFILE);
    findOwnedCart.mockImplementation(() => Promise.resolve(cart));
    priceOrder.mockImplementation(() =>
      Promise.resolve({
        lines: [
          { ...cartLine('DISC', 2), unitPrice: 1299 },
          { ...cartLine('PAD', 3), unitPrice: 749 },
        ],
        delivery: OFFICE_DELIVERY,
        money: MONEY,
      }),
    );
    place.mockResolvedValue({
      kind: 'placed',
      order: { id: 'order-1', orderReference: 'VP-000123' },
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: CustomersService,
          useValue: { requireCompleteProfile, findByClerkId },
        },
        { provide: CartService, useValue: { findOwnedCart } },
        { provide: CheckoutService, useValue: { priceOrder } },
        {
          provide: OrdersRepository,
          useValue: { place, findReference, findOwned },
        },
      ],
    }).compile();

    service = moduleRef.get(OrdersService);
  });

  describe('placeOrder', () => {
    it('places the order with everything it freezes, and answers its reference', async () => {
      const result = await service.placeOrder(CLERK_ID, request());

      expect(result).toEqual({
        order: { orderId: 'order-1', orderReference: 'VP-000123' },
        isReplay: false,
      });
      expect(place).toHaveBeenCalledWith({
        cartId: CART_ID,
        cartVersion: 7,
        customerId: 'customer-1',
        contact: {
          firstName: 'Иван',
          lastName: 'Петров',
          phone: '+359888123456',
          email: 'ivan@example.com',
        },
        items: [
          {
            brandId: '30',
            articleNumber: 'DISC',
            brandName: 'BOSCH',
            description: 'Част DISC',
            thumbnailUrl: 'https://images.example/DISC.jpg',
            quantity: 2,
            unitPrice: 1299,
            lineTotal: 2598,
          },
          {
            brandId: '30',
            articleNumber: 'PAD',
            brandName: 'BOSCH',
            description: 'Част PAD',
            thumbnailUrl: 'https://images.example/PAD.jpg',
            quantity: 3,
            unitPrice: 749,
            lineTotal: 2247,
          },
        ],
        delivery: OFFICE_DELIVERY,
        money: MONEY,
        paymentMethod: 'CASH_ON_DELIVERY',
        termsVersion: TERMS_VERSION,
      });
    });

    it('prices the cart’s own lines with the delivery and payment asked for', async () => {
      await service.placeOrder(CLERK_ID, request());

      expect(findOwnedCart).toHaveBeenCalledWith('customer-1', CART_ID);
      expect(priceOrder).toHaveBeenCalledWith(cart.lines, request());
    });

    it('refuses a customer whose profile lacks what an order needs', async () => {
      requireCompleteProfile.mockRejectedValue(
        new CustomerDetailsRequiredException(),
      );

      await expect(
        service.placeOrder(CLERK_ID, request()),
      ).rejects.toBeInstanceOf(CustomerDetailsRequiredException);
      expect(place).not.toHaveBeenCalled();
    });

    it('answers 404 for a cart that is not the customer’s', async () => {
      findOwnedCart.mockResolvedValue(null);

      await expect(
        service.placeOrder(CLERK_ID, request()),
      ).rejects.toBeInstanceOf(OrderCartNotFoundException);
    });

    it('answers a cart already ordered from with its order, reading nothing else', async () => {
      cart = { ...cart, status: 'ORDERED', orderId: 'order-1', version: 8 };
      findReference.mockResolvedValue({
        id: 'order-1',
        orderReference: 'VP-000123',
      });

      const result = await service.placeOrder(CLERK_ID, request());

      expect(result).toEqual({
        order: { orderId: 'order-1', orderReference: 'VP-000123' },
        isReplay: true,
      });
      expect(priceOrder).not.toHaveBeenCalled();
      expect(place).not.toHaveBeenCalled();
    });

    it.each([
      ['edited since the page priced it', { version: 8 }],
      ['merged into another', { status: 'MERGED' as const }],
    ])('refuses a cart %s', async (_case, change) => {
      cart = { ...cart, ...change };

      await expect(
        service.placeOrder(CLERK_ID, request()),
      ).rejects.toBeInstanceOf(CartStaleException);
      expect(priceOrder).not.toHaveBeenCalled();
    });

    it('places nothing when checkout refuses to price the cart', async () => {
      priceOrder.mockRejectedValue(new ArticleUnavailableException());

      await expect(
        service.placeOrder(CLERK_ID, request()),
      ).rejects.toBeInstanceOf(ArticleUnavailableException);
      expect(place).not.toHaveBeenCalled();
    });

    it.each([
      ['lower', EXPECTED_TOTAL - 1],
      ['higher', EXPECTED_TOTAL + 1],
    ])(
      'refuses a total a cent %s than the live one',
      async (_case, expectedTotalCents) => {
        await expect(
          service.placeOrder(CLERK_ID, request({ expectedTotalCents })),
        ).rejects.toBeInstanceOf(PriceChangedException);
        expect(place).not.toHaveBeenCalled();
      },
    );

    it('answers the twin request’s order when the cart was ordered meanwhile', async () => {
      place.mockResolvedValue({
        kind: 'replayed',
        order: { id: 'order-1', orderReference: 'VP-000123' },
      });

      const result = await service.placeOrder(CLERK_ID, request());

      expect(result.isReplay).toBe(true);
      expect(result.order.orderId).toBe('order-1');
    });

    it('refuses when the cart moved after the checks', async () => {
      place.mockResolvedValue({ kind: 'stale' });

      await expect(
        service.placeOrder(CLERK_ID, request()),
      ).rejects.toBeInstanceOf(CartStaleException);
    });
  });

  describe('getOrder', () => {
    it('refuses someone with no customer row as though there were no order', async () => {
      findByClerkId.mockResolvedValue(null);

      await expect(
        service.getOrder(CLERK_ID, 'order-1'),
      ).rejects.toBeInstanceOf(OrderNotFoundException);
      expect(findOwned).not.toHaveBeenCalled();
    });

    it('reads only the customer’s own order, and 404s any other', async () => {
      findByClerkId.mockResolvedValue({ id: 'customer-1' });
      findOwned.mockResolvedValue(null);

      await expect(
        service.getOrder(CLERK_ID, 'order-1'),
      ).rejects.toBeInstanceOf(OrderNotFoundException);
      expect(findOwned).toHaveBeenCalledWith('order-1', 'customer-1');
    });
  });
});
