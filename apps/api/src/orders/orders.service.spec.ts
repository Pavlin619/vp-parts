import { Test } from '@nestjs/testing';
import {
  CustomerRole,
  DeliveryMethod,
  PaymentMethod,
  PlaceOrderRequestDto,
  QuickOrderRequestDto,
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
  OrdersAwaitingCallLimitException,
  PriceChangedException,
} from './orders.exceptions';
import { OrdersRepository } from './orders.repository';
import {
  MAX_ORDERS_AWAITING_CALL_PER_PHONE,
  OrdersService,
  TERMS_VERSION,
} from './orders.service';

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

const GUEST_TOKEN = 'g'.repeat(43);

function quickRequest(
  overrides: Partial<QuickOrderRequestDto> = {},
): QuickOrderRequestDto {
  return {
    ...request(),
    contact: {
      firstName: 'Мария',
      lastName: 'Иванова',
      phoneNumber: '+359888765432',
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
  const findGuestCart = jest.fn();
  const priceOrder = jest.fn();
  const place = jest.fn();
  const findReference = jest.fn();
  const findOwned = jest.fn();
  const countAwaitingConfirmation = jest.fn();

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
    findGuestCart.mockImplementation(() => Promise.resolve(cart));
    countAwaitingConfirmation.mockResolvedValue(0);
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
      order: { id: 'order-1', orderReference: 'VP-ORD-000123' },
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: CustomersService,
          useValue: { requireCompleteProfile, findByClerkId },
        },
        { provide: CartService, useValue: { findOwnedCart, findGuestCart } },
        { provide: CheckoutService, useValue: { priceOrder } },
        {
          provide: OrdersRepository,
          useValue: {
            place,
            findReference,
            findOwned,
            countAwaitingConfirmation,
          },
        },
      ],
    }).compile();

    service = moduleRef.get(OrdersService);
  });

  describe('placeOrder', () => {
    it('places the order with everything it freezes, and answers its reference', async () => {
      const result = await service.placeOrder(CLERK_ID, request());

      expect(result).toEqual({
        order: { orderId: 'order-1', orderReference: 'VP-ORD-000123' },
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
        initialStatus: 'PROCESSING',
      });
    });

    it('never counts a customer’s orders against the call limit', async () => {
      await service.placeOrder(CLERK_ID, request());

      expect(countAwaitingConfirmation).not.toHaveBeenCalled();
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
        orderReference: 'VP-ORD-000123',
      });

      const result = await service.placeOrder(CLERK_ID, request());

      expect(result).toEqual({
        order: { orderId: 'order-1', orderReference: 'VP-ORD-000123' },
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
        order: { id: 'order-1', orderReference: 'VP-ORD-000123' },
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

  describe('placeQuickOrder', () => {
    it('places the guest’s cart with no customer, to wait on a confirmation call', async () => {
      const result = await service.placeQuickOrder(GUEST_TOKEN, quickRequest());

      expect(result).toEqual({
        order: { orderId: 'order-1', orderReference: 'VP-ORD-000123' },
        isReplay: false,
      });
      expect(findGuestCart).toHaveBeenCalledWith(GUEST_TOKEN, CART_ID);
      expect(place).toHaveBeenCalledWith(
        expect.objectContaining({
          cartId: CART_ID,
          cartVersion: 7,
          customerId: null,
          contact: {
            firstName: 'Мария',
            lastName: 'Иванова',
            phone: '+359888765432',
            email: null,
          },
          initialStatus: 'AWAITING_CONFIRMATION',
          termsVersion: TERMS_VERSION,
        }),
      );
    });

    it('snapshots the email the guest gave', async () => {
      await service.placeQuickOrder(
        GUEST_TOKEN,
        quickRequest({
          contact: { ...quickRequest().contact, email: 'maria@example.com' },
        }),
      );

      expect(place).toHaveBeenCalledWith(
        expect.objectContaining({
          contact: expect.objectContaining({ email: 'maria@example.com' }),
        }),
      );
    });

    it('prices it exactly as a customer’s order', async () => {
      await service.placeQuickOrder(GUEST_TOKEN, quickRequest());

      expect(priceOrder).toHaveBeenCalledWith(cart.lines, quickRequest());
    });

    it('answers 404 to a request holding no cart token', async () => {
      await expect(
        service.placeQuickOrder(null, quickRequest()),
      ).rejects.toBeInstanceOf(OrderCartNotFoundException);
      expect(findGuestCart).not.toHaveBeenCalled();
    });

    it('answers 404 for a cart the token does not hold', async () => {
      findGuestCart.mockResolvedValue(null);

      await expect(
        service.placeQuickOrder(GUEST_TOKEN, quickRequest()),
      ).rejects.toBeInstanceOf(OrderCartNotFoundException);
    });

    it('answers a retry with its order, even at the limit of open orders', async () => {
      cart = { ...cart, status: 'ORDERED', orderId: 'order-1', version: 8 };
      findReference.mockResolvedValue({
        id: 'order-1',
        orderReference: 'VP-ORD-000123',
      });
      countAwaitingConfirmation.mockResolvedValue(
        MAX_ORDERS_AWAITING_CALL_PER_PHONE,
      );

      const result = await service.placeQuickOrder(GUEST_TOKEN, quickRequest());

      expect(result.isReplay).toBe(true);
      expect(place).not.toHaveBeenCalled();
    });

    it('refuses a phone with as many orders waiting on a call as allowed', async () => {
      countAwaitingConfirmation.mockResolvedValue(
        MAX_ORDERS_AWAITING_CALL_PER_PHONE,
      );

      await expect(
        service.placeQuickOrder(GUEST_TOKEN, quickRequest()),
      ).rejects.toBeInstanceOf(OrdersAwaitingCallLimitException);
      expect(countAwaitingConfirmation).toHaveBeenCalledWith('+359888765432');
      expect(priceOrder).not.toHaveBeenCalled();
    });

    it('allows one below the limit', async () => {
      countAwaitingConfirmation.mockResolvedValue(
        MAX_ORDERS_AWAITING_CALL_PER_PHONE - 1,
      );

      await service.placeQuickOrder(GUEST_TOKEN, quickRequest());

      expect(place).toHaveBeenCalled();
    });

    it('refuses a total that is not the live one', async () => {
      await expect(
        service.placeQuickOrder(
          GUEST_TOKEN,
          quickRequest({ expectedTotalCents: EXPECTED_TOTAL - 1 }),
        ),
      ).rejects.toBeInstanceOf(PriceChangedException);
      expect(place).not.toHaveBeenCalled();
    });
  });

  describe('getOrder', () => {
    it('refuses someone with no customer row as though there were no order', async () => {
      findByClerkId.mockResolvedValue(null);

      await expect(
        service.getOrder(CLERK_ID, 'VP-ORD-000123'),
      ).rejects.toBeInstanceOf(OrderNotFoundException);
      expect(findOwned).not.toHaveBeenCalled();
    });

    it('reads only the customer’s own order, and 404s any other', async () => {
      findByClerkId.mockResolvedValue({ id: 'customer-1' });
      findOwned.mockResolvedValue(null);

      await expect(
        service.getOrder(CLERK_ID, 'VP-ORD-000123'),
      ).rejects.toBeInstanceOf(OrderNotFoundException);
      expect(findOwned).toHaveBeenCalledWith('VP-ORD-000123', 'customer-1');
    });
  });
});
