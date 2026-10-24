import {
  CARRIER_NAMES,
  DeliveryMethod,
  formatPrice,
  OrderAddressDto,
  OrderContactDto,
  OrderDeliveryDto,
  OrderDetailDto,
  PaymentMethod,
} from '@vp-parts-shop/shared';
import type { EmailBlock, EmailFact } from '../../email';
import type { ShopDetails } from './shop-details';

type OrderMoney = Pick<
  OrderDetailDto,
  | 'goodsTotal'
  | 'deliveryPrice'
  | 'cashOnDeliveryFee'
  | 'total'
  | 'vatAmount'
  | 'netAmount'
  | 'delivery'
>;

const SHOP_TIME_ZONE = 'Europe/Sofia';
const STORE_PLACE = 'Нашият магазин в Плевен';

export function isPickup(delivery: OrderDeliveryDto): boolean {
  return delivery.method === DeliveryMethod.STORE_PICKUP;
}

/** "Платете 53,04 € при получаване.", or "Платено с карта: 52,23 €." */
export function paymentText(
  order: Pick<OrderDetailDto, 'paymentMethod' | 'total' | 'delivery'>,
): string {
  if (order.paymentMethod === PaymentMethod.CARD) {
    return `Платено с карта: ${formatPrice(order.total)}.`;
  }

  const where = isPickup(order.delivery)
    ? 'при вземане от магазина'
    : 'при получаване';

  return `Платете ${formatPrice(order.total)} ${where}.`;
}

export function moneyFacts(order: OrderMoney): EmailBlock {
  const fee: EmailFact[] =
    order.cashOnDeliveryFee > 0
      ? [
          {
            label: 'Такса наложен платеж',
            value: [formatPrice(order.cashOnDeliveryFee)],
          },
        ]
      : [];

  return {
    type: 'facts',
    rows: [
      { label: 'Продукти', value: [formatPrice(order.goodsTotal)] },
      {
        label: 'Доставка',
        value: [
          isPickup(order.delivery)
            ? 'Безплатна'
            : formatPrice(order.deliveryPrice),
        ],
      },
      ...fee,
      {
        label: 'Общо с ДДС',
        value: [formatPrice(order.total)],
        isStrong: true,
      },
      { label: 'в т.ч. ДДС', value: [formatPrice(order.vatAmount)] },
      { label: 'Сума без ДДС', value: [formatPrice(order.netAmount)] },
    ],
  };
}

/** Where the order goes and when, as the customer chose it. */
export function deliveryFacts(delivery: OrderDeliveryDto): EmailFact[] {
  return [...destinationFacts(delivery), ...expectedDateFacts(delivery)];
}

/** "офис на Еконт", "адрес с Еконт", "вземане от магазина". */
export function deliveryKind(delivery: OrderDeliveryDto): string {
  switch (delivery.method) {
    case DeliveryMethod.COURIER_OFFICE:
      return `офис на ${CARRIER_NAMES[delivery.carrier]}`;
    case DeliveryMethod.COURIER_ADDRESS:
      return `адрес с ${CARRIER_NAMES[delivery.carrier]}`;
    case DeliveryMethod.STORE_PICKUP:
      return 'вземане от магазина';
  }
}

export function recipientFact(contact: OrderContactDto): EmailFact {
  return {
    label: 'Получател',
    value: [`${contact.firstName} ${contact.lastName}, ${contact.phoneNumber}`],
  };
}

export function webLink(shop: ShopDetails, path: string): string {
  return new URL(path, shop.webOrigin).toString();
}

/** "18 октомври 2026 г. в 11:32 ч.", in the shop’s time. */
export function formatPlacedAt(instant: string): string {
  const placedAt = new Intl.DateTimeFormat('bg-BG', {
    timeZone: SHOP_TIME_ZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(instant));

  return `${placedAt} ч.`;
}

function destinationFacts(delivery: OrderDeliveryDto): EmailFact[] {
  switch (delivery.method) {
    case DeliveryMethod.COURIER_OFFICE:
      return [
        {
          label: `Доставка до ${deliveryKind(delivery)}`,
          value: [delivery.office.name, delivery.office.address],
        },
      ];
    case DeliveryMethod.COURIER_ADDRESS:
      return [
        {
          label: `Доставка до ${deliveryKind(delivery)}`,
          value: [formatAddress(delivery.address)],
        },
        ...(delivery.address.note
          ? [{ label: 'Бележка за куриера', value: [delivery.address.note] }]
          : []),
      ];
    case DeliveryMethod.STORE_PICKUP:
      return [{ label: 'Вземане от магазина', value: [STORE_PLACE] }];
  }
}

function expectedDateFacts(delivery: OrderDeliveryDto): EmailFact[] {
  if (!delivery.expectedDeliveryDate) {
    return [];
  }

  return [
    {
      label: isPickup(delivery) ? 'Готова за вземане' : 'Очаквана доставка',
      value: [formatShopDate(delivery.expectedDeliveryDate)],
    },
  ];
}

/** "чт, 22 октомври": a calendar date, so it is read in UTC and never shifts a day. */
function formatShopDate(date: string): string {
  return new Intl.DateTimeFormat('bg-BG', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${date}T00:00:00Z`));
}

function formatAddress(address: OrderAddressDto): string {
  const street = [address.street, address.streetNumber]
    .filter(Boolean)
    .join(' ');

  return [
    street,
    address.quarter,
    labelled('бл.', address.block),
    labelled('вх.', address.entrance),
    labelled('ет.', address.floor),
    labelled('ап.', address.apartment),
    `${address.postCode} ${address.city}`,
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
}

function labelled(label: string, value: string | undefined): string {
  return value?.trim() ? `${label} ${value.trim()}` : '';
}
