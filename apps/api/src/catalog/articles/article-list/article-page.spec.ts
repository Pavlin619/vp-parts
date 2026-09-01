import { pageOf } from './article-page';

const items = Array.from({ length: 45 }, (_, index) => `A${index}`);

describe('pageOf', () => {
  it('reports the whole set beside the requested slice', () => {
    const page = pageOf(items, 2, 20);

    expect(page.total).toBe(45);
    expect(page.page).toBe(2);
    expect(page.pageSize).toBe(20);
    expect(page.items).toEqual(
      Array.from({ length: 20 }, (_, index) => `A${index + 20}`),
    );
  });

  it('cuts the last page short rather than padding it', () => {
    expect(pageOf(items, 3, 20).items).toEqual([
      'A40',
      'A41',
      'A42',
      'A43',
      'A44',
    ]);
  });

  it('answers a page past the end with no items', () => {
    expect(pageOf(items, 9, 20).items).toEqual([]);
  });

  it('answers an empty set with an empty first page', () => {
    expect(pageOf([], 1, 20)).toEqual({
      total: 0,
      page: 1,
      pageSize: 20,
      items: [],
    });
  });
});
