import {
  CARRIER_NAMES,
  DeliveryMethod,
  formatPrice,
  OrderContactDto,
  OrderDeliveryDto,
  OrderDetailDto,
  OrderStatus,
  PaymentMethod,
} from '@vp-parts-shop/shared';
import { EmailContent, EmailFact, renderEmail } from '../../email';
import {
  deliveryFacts,
  deliveryKind,
  formatPlacedAt,
  isPickup,
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
  const isAwaitingCall = order.status === OrderStatus.AWAITING_CONFIRMATION;

  return renderEmail({
    subject:
      (isAwaitingCall ? 'За потвърждение: ' : '') +
      `Нова поръчка ${order.orderReference} · ${deliveryKind(order.delivery)} · ` +
      formatPrice(order.total),
    blocks: [
      { type: 'title', text: `Нова поръчка ${order.orderReference}` },
      {
        type: 'paragraph',
        text: [
          `Приета на ${formatPlacedAt(order.createdAt)}`,
          ...(isAwaitingCall ? [confirmationCall(order.contact)] : []),
          nextStep(order.delivery),
        ].join(' '),
      },
      { type: 'heading', text: 'Клиент' },
      { type: 'facts', rows: contactFacts(order.contact) },
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

function confirmationCall(contact: OrderContactDto): string {
  return `Обадете се на ${contact.phoneNumber}, за да я потвърдите, преди да я изпълните.`;
}

function contactFacts(contact: OrderContactDto): EmailFact[] {
  const email = contact.email
    ? [{ label: 'Имейл', value: [contact.email] }]
    : [];

  return [
    { label: 'Име', value: [`${contact.firstName} ${contact.lastName}`] },
    { label: 'Телефон', value: [contact.phoneNumber] },
    ...email,
  ];
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
  const isPaidByCard = order.paymentMethod === PaymentMethod.CARD;
  const total = [formatPrice(order.total)];

  if (isPickup(order.delivery)) {
    return [
      isPaidByCard
        ? paidByCard('Платено с карта')
        : { label: 'Плаща се в магазина', value: total },
    ];
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
    isPaidByCard
      ? paidByCard('Платено с карта — без наложен платеж')
      : { label: 'Наложен платеж за събиране', value: total, isStrong: true },
  ];
}

function paidByCard(text: string): EmailFact {
  return { label: 'Плащане', value: [text], isStrong: true };
}
