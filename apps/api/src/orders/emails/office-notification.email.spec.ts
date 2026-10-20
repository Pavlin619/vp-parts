import { officeNotificationEmail } from './office-notification.email';
import { PICKED_UP, PLACED_ORDER, TO_ADDRESS } from './placed-order.fixture';

const NBSP = ' ';
const euros = (amount: string) => `${amount}${NBSP}€`;

describe('officeNotificationEmail', () => {
  const email = officeNotificationEmail(PLACED_ORDER, 10_000);

  it('names the order, how it goes and what is collected in the subject', () => {
    expect(email.subject).toBe(
      `Нова поръчка VP-ORD-000042 · офис на Еконт · ${euros('53,04')}`,
    );
  });

  it('says when it was placed, in the shop’s time, and what to do', () => {
    expect(email.text).toContain('Приета на 18 октомври 2026 г. в 11:32 ч.');
    expect(email.text).toContain('Създайте товарителница в Еконт.');
  });

  it('gives the customer’s contact details', () => {
    expect(email.text).toContain(
      [
        'Име: Иван Петров',
        'Телефон: +359888123456',
        'Имейл: ivan@example.com',
      ].join('\n'),
    );
  });

  it('gives what the waybill needs: the office code, the weight and the amount to collect', () => {
    expect(email.text).toContain(
      'Доставка до офис на Еконт: София Център, София ул. Граф Игнатиев 1',
    );
    expect(email.text).toContain('Код на офиса: 1127');
    expect(email.text).toContain('Тегло на пратката: 10 кг');
    expect(email.text).toContain(
      `Наложен платеж за събиране: ${euros('53,04')}`,
    );
  });

  it('lists the parts with their article numbers apart, for picking', () => {
    expect(email.text).toContain(
      `- BOSCH · 0 986 479 R65 · Спирачен диск · 2 · ${euros('12,99')} · ${euros('25,98')}`,
    );
  });

  it('describes an address delivery with its note', () => {
    const toAddress = officeNotificationEmail(
      { ...PLACED_ORDER, delivery: TO_ADDRESS },
      2_500,
    );

    expect(toAddress.subject).toContain('адрес с Еконт');
    expect(toAddress.text).toContain(
      'Доставка до адрес с Еконт: бул. Витоша 10, ет. 3, ап. 7, 1000 София',
    );
    expect(toAddress.text).toContain('Бележка за куриера: Звънец 3');
    expect(toAddress.text).toContain('Тегло на пратката: 2,5 кг');
  });

  it('asks a pickup to be made ready, paid at the counter, with no parcel', () => {
    const pickup = officeNotificationEmail(
      { ...PLACED_ORDER, ...PICKED_UP },
      null,
    );

    expect(pickup.subject).toBe(
      `Нова поръчка VP-ORD-000042 · вземане от магазина · ${euros('48,45')}`,
    );
    expect(pickup.text).toContain('Подгответе я за вземане от магазина.');
    expect(pickup.text).toContain(`Плаща се в магазина: ${euros('48,45')}`);
    expect(pickup.text).not.toContain('Тегло на пратката');
    expect(pickup.text).not.toContain('Наложен платеж за събиране');
  });
});
