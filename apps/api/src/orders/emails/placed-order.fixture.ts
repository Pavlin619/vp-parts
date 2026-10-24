import {
  DeliveryMethod,
  OrderDetailDto,
  OrderStatus,
  PaymentMethod,
  ShippingMethod,
} from '@vp-parts-shop/shared';
import type { OrderRecord } from '../orders.repository';
import type { ShopDetails } from './shop-details';

/** The worked example in docs/ORDERS.md → "Money", to an Econt office. Test support only. */
export const PLACED_ORDER: OrderDetailDto = {
  orderId: 'order-1',
  orderReference: 'VP-ORD-000042',
  status: OrderStatus.PROCESSING,
  createdAt: '2026-10-18T08:32:00.000Z',
  items: [
    {
      brandId: '30',
      articleNumber: '0 986 479 R65',
      brandName: 'BOSCH',
      description: 'Спирачен диск',
      thumbnailUrl: null,
      quantity: 2,
      unitPrice: 1299,
      lineTotal: 2598,
    },
    {
      brandId: '30',
      articleNumber: '0 986 494 524',
      brandName: 'BOSCH',
      description: 'Накладки',
      thumbnailUrl: null,
      quantity: 3,
      unitPrice: 749,
      lineTotal: 2247,
    },
  ],
  delivery: {
    method: DeliveryMethod.COURIER_OFFICE,
    carrier: ShippingMethod.ECONT,
    office: {
      code: '1127',
      name: 'София Център',
      address: 'София ул. Граф Игнатиев 1',
      weekdayHours: null,
      saturdayHours: null,
    },
    expectedDeliveryDate: '2026-10-22',
  },
  paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
  contact: {
    firstName: 'Иван',
    lastName: 'Петров',
    phoneNumber: '+359888123456',
    email: 'ivan@example.com',
  },
  statusHistory: [
    { status: OrderStatus.PROCESSING, occurredAt: '2026-10-18T08:32:00.000Z' },
  ],
  goodsTotal: 4845,
  deliveryPrice: 378,
  cashOnDeliveryFee: 81,
  total: 5304,
  netAmount: 4420,
  vatAmount: 884,
};

export const TO_ADDRESS: OrderDetailDto['delivery'] = {
  method: DeliveryMethod.COURIER_ADDRESS,
  carrier: ShippingMethod.ECONT,
  address: {
    placeId: '41',
    street: 'бул. Витоша',
    streetNumber: '10',
    floor: '3',
    apartment: '7',
    note: 'Звънец 3',
    city: 'София',
    postCode: '1000',
  },
  expectedDeliveryDate: '2026-10-22',
};

export const PICKED_UP: Pick<
  OrderDetailDto,
  'delivery' | 'deliveryPrice' | 'cashOnDeliveryFee' | 'total' | 'vatAmount'
> = {
  delivery: {
    method: DeliveryMethod.STORE_PICKUP,
    expectedDeliveryDate: '2026-10-20',
  },
  deliveryPrice: 0,
  cashOnDeliveryFee: 0,
  total: 4845,
  vatAmount: 807,
};

/** The same order paid by card, so with no cash-on-delivery fee. */
export const PAID_BY_CARD: Pick<
  OrderDetailDto,
  'paymentMethod' | 'cashOnDeliveryFee' | 'total' | 'vatAmount' | 'netAmount'
> = {
  paymentMethod: PaymentMethod.CARD,
  cashOnDeliveryFee: 0,
  total: 5223,
  vatAmount: 871,
  netAmount: 4352,
};

export const SHOP: ShopDetails = {
  seller: {
    name: 'ВП Партс ЕООД',
    companyId: '123456789',
    address: 'гр. Плевен, ул. Примерна 1',
    email: 'shop@vp-parts.bg',
    phone: '+359 64 000 000',
  },
  webOrigin: 'https://vp-parts.bg',
};

/** {@link PLACED_ORDER} as the database holds it. */
export const PLACED_ORDER_RECORD: OrderRecord = {
  id: 'order-1',
  orderReference: 'VP-ORD-000042',
  customerId: 'customer-1',
  cartId: 'cart-1',
  status: 'PROCESSING',
  deliveryMethod: 'COURIER_OFFICE',
  carrier: 'ECONT',
  deliverySnapshot: {
    office: {
      code: '1127',
      name: 'София Център',
      address: 'София ул. Граф Игнатиев 1',
      weekdayHours: null,
      saturdayHours: null,
    },
  },
  expectedDeliveryDate: new Date('2026-10-22'),
  parcelWeightGrams: 10_000,
  goodsTotal: 4845,
  deliveryPrice: 378,
  cashOnDeliveryFee: 81,
  total: 5304,
  vatAmount: 884,
  paymentMethod: 'CASH_ON_DELIVERY',
  paymentReference: null,
  contactFirstName: 'Иван',
  contactLastName: 'Петров',
  contactPhone: '+359888123456',
  contactEmail: 'ivan@example.com',
  termsVersion: '2026-10-17',
  trackingReference: null,
  vehicleTag: null,
  jobReference: null,
  createdAt: new Date(PLACED_ORDER.createdAt),
  updatedAt: new Date(PLACED_ORDER.createdAt),
  items: PLACED_ORDER.items.map((item, index) => ({
    ...item,
    id: `item-${index + 1}`,
    orderId: 'order-1',
  })),
  statusHistory: [
    {
      id: 'history-1',
      orderId: 'order-1',
      status: 'PROCESSING',
      occurredAt: new Date(PLACED_ORDER.createdAt),
      source: 'shop',
    },
  ],
};
