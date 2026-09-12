import { catalogLabelOf } from './catalog-label';

describe('catalogLabelOf', () => {
  it('raises a lower-case label', () => {
    expect(catalogLabelOf('спирачна уредба')).toBe('Спирачна уредба');
    expect(catalogLabelOf('маслен филтър')).toBe('Маслен филтър');
  });

  it('leaves a label TecDoc already capitalised alone', () => {
    expect(catalogLabelOf('Система комфорт')).toBe('Система комфорт');
    expect(catalogLabelOf('Тегло [kg]')).toBe('Тегло [kg]');
  });

  // A word-by-word transform (CSS `capitalize`, a title-caser) would render
  // this as `Части За Сервиз/ Инспекция/ Обслужване`.
  it('raises the first character only, however many words follow', () => {
    expect(catalogLabelOf('части за сервиз/ инспекция/ обслужване')).toBe(
      'Части за сервиз/ инспекция/ обслужване',
    );
    expect(catalogLabelOf('уплътнение, маслен филтър')).toBe(
      'Уплътнение, маслен филтър',
    );
  });

  it('keeps capitals that already sit inside the label', () => {
    expect(catalogLabelOf('датчик, ABS')).toBe('Датчик, ABS');
  });

  // Criteria names are half units and brackets, and a spec key that opens on
  // one has no letter to raise.
  it('leaves a label that does not open on a letter unchanged', () => {
    expect(catalogLabelOf('[mm]')).toBe('[mm]');
    expect(catalogLabelOf('4x4 система')).toBe('4x4 система');
    expect(catalogLabelOf('3/4-16 UNF')).toBe('3/4-16 UNF');
    expect(catalogLabelOf('')).toBe('');
  });
});
