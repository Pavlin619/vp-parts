import {
  DeliveryMethod,
  OrderStatus,
  PaymentMethod,
  ShippingMethod,
  type OrderDetailDto,
} from '@vp-parts-shop/shared'

export function orderDetail(overrides: Partial<OrderDetailDto> = {}): OrderDetailDto {
  return {
    orderId: 'order-1',
    orderReference: 'VP-ORD-000123',
    status: OrderStatus.PROCESSING,
    createdAt: '2026-10-16T08:32:00.000Z',
    items: [
      {
        brandId: '268',
        articleNumber: 'WL6340',
        brandName: 'WIX',
        description: 'Маслен филтър',
        thumbnailUrl: 'https://digital-assets.tecalliance.services/WL6340.jpg',
        quantity: 2,
        unitPrice: 1299,
        lineTotal: 2598,
      },
      {
        brandId: '30',
        articleNumber: 'BP1234',
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
        name: 'Еконт София Център',
        address: 'ул. Пиротска 5',
        weekdayHours: { opensAt: '09:00', closesAt: '18:00' },
        saturdayHours: { opensAt: '10:00', closesAt: '14:00' },
      },
      expectedDeliveryDate: '2026-10-19',
    },
    paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
    contact: {
      firstName: 'Иван',
      lastName: 'Петров',
      phoneNumber: '+359888123456',
      email: 'ivan@example.bg',
    },
    statusHistory: [],
    goodsTotal: 4845,
    deliveryPrice: 378,
    cashOnDeliveryFee: 81,
    total: 5304,
    netAmount: 4420,
    vatAmount: 884,
    ...overrides,
  }
}
