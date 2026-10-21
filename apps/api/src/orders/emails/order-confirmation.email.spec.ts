import { orderConfirmationEmail } from './order-confirmation.email';
import {
  PICKED_UP,
  PLACED_ORDER,
  SHOP,
  TO_ADDRESS,
} from './placed-order.fixture';

const NBSP = ' ';
const euros = (amount: string) => `${amount}${NBSP}€`;

describe('orderConfirmationEmail', () => {
  const ORDER_PATH = '/orders/VP-ORD-000042';
  const email = orderConfirmationEmail(PLACED_ORDER, SHOP, ORDER_PATH);

  it('names the order in the subject', () => {
    expect(email.subject).toBe('Поръчка VP-ORD-000042 е приета');
  });

  it('says what is paid at the door before anything else', () => {
    const due = email.text.indexOf(`Платете ${euros('53,04')} при получаване.`);

    expect(due).toBeGreaterThan(-1);
    expect(due).toBeLessThan(email.text.indexOf('Поръчани части'));
  });

  it('lists each part with its quantity, unit price and line total', () => {
    expect(email.text).toContain(
      `- BOSCH 0 986 479 R65 — Спирачен диск · 2 · ${euros('12,99')} · ${euros('25,98')}`,
    );
    expect(email.text).toContain(
      `- BOSCH 0 986 494 524 — Накладки · 3 · ${euros('7,49')} · ${euros('22,47')}`,
    );
  });

  it('gives the money as the order froze it, with the VAT in the whole total', () => {
    expect(email.text).toContain(
      [
        `Продукти: ${euros('48,45')}`,
        `Доставка: ${euros('3,78')}`,
        `Такса наложен платеж: ${euros('0,81')}`,
        `Общо с ДДС: ${euros('53,04')}`,
        `в т.ч. ДДС: ${euros('8,84')}`,
        `Сума без ДДС: ${euros('44,20')}`,
      ].join('\n'),
    );
  });

  it('says where the parcel goes, when it is expected and who receives it', () => {
    expect(email.text).toContain(
      'Доставка до офис на Еконт: София Център, София ул. Граф Игнатиев 1',
    );
    expect(email.text).toContain('Очаквана доставка: чт, 22 октомври');
    expect(email.text).toContain('Получател: Иван Петров, +359888123456');
  });

  it('describes an address delivery with the note for the courier', () => {
    const toAddress = orderConfirmationEmail(
      { ...PLACED_ORDER, delivery: TO_ADDRESS },
      SHOP,
      ORDER_PATH,
    );

    expect(toAddress.text).toContain(
      'Доставка до адрес с Еконт: бул. Витоша 10, ет. 3, ап. 7, 1000 София',
    );
    expect(toAddress.text).toContain('Бележка за куриера: Звънец 3');
  });

  it('describes a pickup as paid in the shop, with no delivery charge', () => {
    const pickup = orderConfirmationEmail(
      { ...PLACED_ORDER, ...PICKED_UP },
      SHOP,
      ORDER_PATH,
    );

    expect(pickup.text).toContain(
      `Платете ${euros('48,45')} при вземане от магазина.`,
    );
    expect(pickup.text).toContain('Доставка: Безплатна');
    expect(pickup.text).not.toContain('Такса наложен платеж');
    expect(pickup.text).toContain(
      'Вземане от магазина: Нашият магазин в Плевен',
    );
    expect(pickup.text).toContain('Готова за вземане: вт, 20 октомври');
  });

  it('links the order page and the legal pages on the web', () => {
    expect(email.text).toContain(
      'Вижте поръчката онлайн: https://vp-parts.bg/orders/VP-ORD-000042',
    );
    expect(email.text).toContain('https://vp-parts.bg/withdrawal');
    expect(email.text).toContain('https://vp-parts.bg/terms');
    expect(email.text).toContain('https://vp-parts.bg/privacy');
  });

  it('links a guest’s order with the key its path carries', () => {
    const guest = orderConfirmationEmail(
      PLACED_ORDER,
      SHOP,
      '/orders/VP-ORD-000042#k=the-key',
    );

    expect(guest.text).toContain(
      'Вижте поръчката онлайн: https://vp-parts.bg/orders/VP-ORD-000042#k=the-key',
    );
  });

  it('states the 14-day withdrawal right and how to use it', () => {
    expect(email.text).toContain('Право на отказ');
    expect(email.text).toContain('в срок от 14 дни, без да посочвате причина');
    expect(email.text).toContain('shop@vp-parts.bg');
  });

  it('identifies the seller', () => {
    expect(email.text).toContain(
      'Продавач: ВП Партс ЕООД, ЕИК 123456789, гр. Плевен, ул. Примерна 1 · тел. +359 64 000 000 · shop@vp-parts.bg',
    );
  });

  it('renders the same content as HTML', () => {
    expect(email.html).toContain('VP-ORD-000042');
    expect(email.html).toContain(
      '<a href="https://vp-parts.bg/orders/VP-ORD-000042"',
    );
  });
});
