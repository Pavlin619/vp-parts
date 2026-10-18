import { DeliveryMethod, ShippingMethod } from '@vp-parts-shop/shared';
import { toOrderDetailDto } from './orders.mapper';
import type { OrderRecord } from './orders.repository';

const CREATED_AT = new Date('2026-10-16T08:32:00.000Z');

function order(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: 'order-1',
    orderReference: 'VP-ORD-000123',
    customerId: 'customer-1',
    cartId: 'cart-1',
    status: 'PROCESSING',
    deliveryMethod: 'COURIER_OFFICE',
    carrier: 'ECONT',
    deliverySnapshot: {
      office: {
        code: '1127',
        name: 'София',
        address: 'ул. 1',
        weekdayHours: { opensAt: '09:00', closesAt: '18:00' },
        saturdayHours: null,
      },
    },
    expectedDeliveryDate: new Date('2026-10-17'),
    parcelWeightGrams: 4000,
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
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    items: [
      {
        id: 'item-1',
        orderId: 'order-1',
        brandId: '30',
        articleNumber: 'DISC',
        brandName: 'BOSCH',
        description: 'Диск',
        thumbnailUrl: 'https://images.example/DISC.jpg',
        quantity: 2,
        unitPrice: 1299,
        lineTotal: 2598,
      },
    ],
    statusHistory: [
      {
        id: 'history-1',
        orderId: 'order-1',
        status: 'PROCESSING',
        occurredAt: CREATED_AT,
        source: 'shop',
      },
    ],
    ...overrides,
  };
}

describe('toOrderDetailDto', () => {
  it('answers the frozen money with the net worked out of the total', () => {
    const dto = toOrderDetailDto(order());

    expect(dto).toMatchObject({
      orderId: 'order-1',
      orderReference: 'VP-ORD-000123',
      status: 'PROCESSING',
      createdAt: '2026-10-16T08:32:00.000Z',
      goodsTotal: 4845,
      deliveryPrice: 378,
      cashOnDeliveryFee: 81,
      total: 5304,
      netAmount: 4420,
      vatAmount: 884,
      paymentMethod: 'CASH_ON_DELIVERY',
      contact: {
        firstName: 'Иван',
        lastName: 'Петров',
        phoneNumber: '+359888123456',
        email: 'ivan@example.com',
      },
      statusHistory: [
        { status: 'PROCESSING', occurredAt: '2026-10-16T08:32:00.000Z' },
      ],
    });
    expect(dto.items).toEqual([
      {
        brandId: '30',
        articleNumber: 'DISC',
        brandName: 'BOSCH',
        description: 'Диск',
        thumbnailUrl: 'https://images.example/DISC.jpg',
        quantity: 2,
        unitPrice: 1299,
        lineTotal: 2598,
      },
    ]);
  });

  it('names the office an office delivery goes to, with its date as a day', () => {
    expect(toOrderDetailDto(order()).delivery).toEqual({
      method: DeliveryMethod.COURIER_OFFICE,
      carrier: ShippingMethod.ECONT,
      office: {
        code: '1127',
        name: 'София',
        address: 'ул. 1',
        weekdayHours: { opensAt: '09:00', closesAt: '18:00' },
        saturdayHours: null,
      },
      expectedDeliveryDate: '2026-10-17',
    });
  });

  it('names the address an address delivery goes to', () => {
    const address = {
      placeId: '41',
      street: 'бул. Витоша',
      streetNumber: '10',
      city: 'София',
      postCode: '1000',
    };

    const dto = toOrderDetailDto(
      order({
        deliveryMethod: 'COURIER_ADDRESS',
        deliverySnapshot: { address },
      }),
    );

    expect(dto.delivery).toEqual({
      method: DeliveryMethod.COURIER_ADDRESS,
      carrier: ShippingMethod.ECONT,
      address,
      expectedDeliveryDate: '2026-10-17',
    });
  });

  it('answers pickup with no carrier and no destination', () => {
    const dto = toOrderDetailDto(
      order({
        deliveryMethod: 'STORE_PICKUP',
        carrier: null,
        deliverySnapshot: {},
        expectedDeliveryDate: null,
      }),
    );

    expect(dto.delivery).toEqual({
      method: DeliveryMethod.STORE_PICKUP,
      expectedDeliveryDate: null,
    });
  });

  it('fails loudly for a courier order missing what it was sent with', () => {
    expect(() => toOrderDetailDto(order({ carrier: null }))).toThrow('order-1');
    expect(() => toOrderDetailDto(order({ deliverySnapshot: {} }))).toThrow(
      'order-1',
    );
  });
});
