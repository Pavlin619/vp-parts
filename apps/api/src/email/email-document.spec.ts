import { EmailBlock, renderEmail } from './email-document';

function render(...blocks: EmailBlock[]) {
  return renderEmail({ subject: 'Тема', blocks });
}

describe('renderEmail', () => {
  it('keeps the subject and titles the page with it', () => {
    const email = render({ type: 'title', text: 'Благодарим!' });

    expect(email.subject).toBe('Тема');
    expect(email.html).toContain('<title>Тема</title>');
    expect(email.html).toContain('Благодарим!');
    expect(email.text).toBe('Благодарим!');
  });

  it('escapes every value it is given, in the markup and the title', () => {
    const email = renderEmail({
      subject: 'A & B',
      blocks: [
        { type: 'paragraph', text: '<script>alert(1)</script>' },
        { type: 'facts', rows: [{ label: '"Име"', value: ["O'Brien <x>"] }] },
        {
          type: 'table',
          columns: [{ header: '<b>' }],
          rows: [['Диск & накладки']],
        },
      ],
    });

    expect(email.html).toContain('<title>A &amp; B</title>');
    expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(email.html).toContain('&quot;Име&quot;');
    expect(email.html).toContain('O&#39;Brien &lt;x&gt;');
    expect(email.html).toContain('&lt;b&gt;');
    expect(email.html).toContain('Диск &amp; накладки');
    expect(email.html).not.toContain('<script>');
    expect(email.text).toContain('<script>alert(1)</script>');
  });

  it('writes facts as label and value lines', () => {
    const email = render({
      type: 'facts',
      rows: [
        { label: 'Продукти', value: ['48,45 €'] },
        { label: 'Общо с ДДС', value: ['53,04 €'], isStrong: true },
        { label: 'Офис', value: ['София Център', 'ул. Граф Игнатиев 1'] },
      ],
    });

    expect(email.text).toBe(
      [
        'Продукти: 48,45 €',
        'Общо с ДДС: 53,04 €',
        'Офис: София Център, ул. Граф Игнатиев 1',
      ].join('\n'),
    );
    expect(email.html).toContain('<strong>53,04 €</strong>');
    expect(email.html).toContain('София Център<br>ул. Граф Игнатиев 1');
  });

  it('writes a table as one line per row in the text', () => {
    const email = render({
      type: 'table',
      columns: [{ header: 'Част' }, { header: 'Брой', isNumeric: true }],
      rows: [
        ['Диск', '2'],
        ['Накладки', '3'],
      ],
    });

    expect(email.text).toBe('- Диск · 2\n- Накладки · 3');
    expect(email.html).toContain('<th');
    expect(email.html).toMatch(/text-align:right[^>]*>2</);
  });

  it('gives each link its address in the text', () => {
    const email = render({
      type: 'links',
      links: [{ text: 'Общи условия', href: 'https://shop.bg/terms?a=1&b=2' }],
    });

    expect(email.text).toBe('Общи условия: https://shop.bg/terms?a=1&b=2');
    expect(email.html).toContain('<a href="https://shop.bg/terms?a=1&amp;b=2"');
  });

  it('separates blocks with a blank line and underlines headings in the text', () => {
    const email = render(
      { type: 'heading', text: 'Доставка' },
      { type: 'paragraph', text: 'До офис.' },
      { type: 'note', text: 'Продавач: ВП Партс ЕООД' },
    );

    expect(email.text).toBe(
      'Доставка\n--------\n\nДо офис.\n\nПродавач: ВП Партс ЕООД',
    );
  });
});
