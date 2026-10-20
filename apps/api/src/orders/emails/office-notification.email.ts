import {
  CARRIER_NAMES,
  DeliveryMethod,
  formatPrice,
  OrderDeliveryDto,
  OrderDetailDto,
} from '@vp-parts-shop/shared';
import { EmailContent, EmailFact, renderEmail } from '../../email';
import {
  deliveryFacts,
  deliveryKind,
  formatPlacedAt,
  moneyFacts,
} from './order-email-parts';

const weightFormat = new Intl.NumberFormat('bg-BG', {
  maximumFractionDigits: 2,
});

/**
 * Tells the office a new order is in, with what the Econt waybill needs. It is
 * the channel until the backoffice consumes `shop-events` — docs/ORDERS.md.
 */
export function officeNotificationEmail(
  order: OrderDetailDto,
  parcelWeightGrams: number | null,
): EmailContent {
  return renderEmail({
    subject:
      `Нова поръчка ${order.orderReference} · ${deliveryKind(order.delivery)} · ` +
      formatPrice(order.total),
    blocks: [
      { type: 'title', text: `Нова поръчка ${order.orderReference}` },
      {
        type: 'paragraph',
        text: `Приета на ${formatPlacedAt(order.createdAt)} ${nextStep(order.delivery)}`,
      },
      { type: 'heading', text: 'Клиент' },
      {
        type: 'facts',
        rows: [
          {
            label: 'Име',
            value: [`${order.contact.firstName} ${order.contact.lastName}`],
          },
          { label: 'Телефон', value: [order.contact.phoneNumber] },
          { label: 'Имейл', value: [order.contact.email] },
        ],
      },
      { type: 'heading', text: 'Доставка' },
      {
        type: 'facts',
        rows: [
          ...deliveryFacts(order.delivery),
          ...waybillFacts(order, parcelWeightGrams),
        ],
      },
      { type: 'heading', text: 'Части' },
      {
        type: 'table',
        columns: [
          { header: 'Марка' },
          { header: 'Номер' },
          { header: 'Описание' },
          { header: 'Брой', isNumeric: true },
          { header: 'Ед. цена', isNumeric: true },
          { header: 'Общо', isNumeric: true },
        ],
        rows: order.items.map((item) => [
          item.brandName,
          item.articleNumber,
          item.description,
          String(item.quantity),
          formatPrice(item.unitPrice),
          formatPrice(item.lineTotal),
        ]),
      },
      moneyFacts(order),
    ],
  });
}

function nextStep(delivery: OrderDeliveryDto): string {
  return delivery.method === DeliveryMethod.STORE_PICKUP
    ? 'Подгответе я за вземане от магазина.'
    : `Създайте товарителница в ${CARRIER_NAMES[delivery.carrier]}.`;
}

function waybillFacts(
  order: OrderDetailDto,
  parcelWeightGrams: number | null,
): EmailFact[] {
  const total = [formatPrice(order.total)];

  if (order.delivery.method === DeliveryMethod.STORE_PICKUP) {
    return [{ label: 'Плаща се в магазина', value: total }];
  }

  const officeCode =
    order.delivery.method === DeliveryMethod.COURIER_OFFICE
      ? [{ label: 'Код на офиса', value: [order.delivery.office.code] }]
      : [];
  const weight =
    parcelWeightGrams === null
      ? []
      : [
          {
            label: 'Тегло на пратката',
            value: [`${weightFormat.format(parcelWeightGrams / 1000)} кг`],
          },
        ];

  return [
    ...officeCode,
    ...weight,
    { label: 'Наложен платеж за събиране', value: total, isStrong: true },
  ];
}
