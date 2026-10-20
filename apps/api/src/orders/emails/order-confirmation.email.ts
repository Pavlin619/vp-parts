import {
  formatPrice,
  LEGAL_PAGES,
  OrderDetailDto,
  orderPagePath,
} from '@vp-parts-shop/shared';
import { EmailBlock, EmailContent, renderEmail } from '../../email';
import {
  amountDueText,
  deliveryFacts,
  moneyFacts,
  recipientFact,
  webLink,
} from './order-email-parts';
import type { Seller, ShopDetails } from './shop-details';

/**
 * The customer's confirmation, the durable medium the contract is confirmed on
 * (ЗЗП чл. 49, CRD Art. 8(7)) — docs/ORDERS.md → "Legal".
 */
export function orderConfirmationEmail(
  order: OrderDetailDto,
  shop: ShopDetails,
): EmailContent {
  return renderEmail({
    subject: `Поръчка ${order.orderReference} е приета`,
    blocks: [
      { type: 'title', text: 'Благодарим за поръчката!' },
      {
        type: 'paragraph',
        text:
          `Здравейте, ${order.contact.firstName}! Приехме поръчката ви ` +
          `${order.orderReference}. Това писмо потвърждава договора ни — пазете го.`,
      },
      ...amountDueBlocks(order),
      { type: 'heading', text: 'Поръчани части' },
      itemsTable(order),
      moneyFacts(order),
      { type: 'heading', text: 'Доставка' },
      {
        type: 'facts',
        rows: [...deliveryFacts(order.delivery), recipientFact(order.contact)],
      },
      {
        type: 'links',
        links: [
          {
            text: 'Вижте поръчката онлайн',
            href: webLink(shop, orderPagePath(order.orderReference)),
          },
        ],
      },
      ...withdrawalBlocks(shop),
      { type: 'note', text: sellerLine(shop.seller) },
    ],
  });
}

function amountDueBlocks(order: OrderDetailDto): EmailBlock[] {
  const text = amountDueText(order);

  return text ? [{ type: 'paragraph', text, isStrong: true }] : [];
}

function itemsTable(order: OrderDetailDto): EmailBlock {
  return {
    type: 'table',
    columns: [
      { header: 'Част' },
      { header: 'Брой', isNumeric: true },
      { header: 'Ед. цена', isNumeric: true },
      { header: 'Общо', isNumeric: true },
    ],
    rows: order.items.map((item) => [
      `${item.brandName} ${item.articleNumber} — ${item.description}`,
      String(item.quantity),
      formatPrice(item.unitPrice),
      formatPrice(item.lineTotal),
    ]),
  };
}

/** The model wording of ЗЗП чл. 50 / CRD Annex I(A). */
function withdrawalBlocks(shop: ShopDetails): EmailBlock[] {
  return [
    { type: 'heading', text: 'Право на отказ' },
    {
      type: 'paragraph',
      text:
        'Имате право да се откажете от договора в срок от 14 дни, без да ' +
        'посочвате причина. Срокът изтича 14 дни след деня, в който вие или ' +
        'посочено от вас трето лице, различно от превозвача, получите стоките. ' +
        'За да упражните правото си, уведомете ни с недвусмислено заявление — ' +
        `например писмо или имейл до ${shop.seller.email}. Можете да използвате ` +
        'стандартния формуляр за отказ, но не сте длъжни.',
    },
    {
      type: 'links',
      links: [
        {
          text: 'Право на отказ и стандартен формуляр',
          href: webLink(shop, LEGAL_PAGES.withdrawal),
        },
        { text: 'Общи условия', href: webLink(shop, LEGAL_PAGES.terms) },
        {
          text: 'Политика за поверителност',
          href: webLink(shop, LEGAL_PAGES.privacy),
        },
      ],
    },
  ];
}

function sellerLine(seller: Seller): string {
  return (
    `Продавач: ${seller.name}, ЕИК ${seller.companyId}, ${seller.address} · ` +
    `тел. ${seller.phone} · ${seller.email}`
  );
}
