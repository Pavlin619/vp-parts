import { TecDocTransport } from '../../../tecdoc';
import { ArticleRowsTecDoc } from './article-rows.tecdoc';

const BOSCH = 30;
const BRAKE_DISC = 82;

/** A hydration answer: the display fields a rendered row is read with. */
function record(articleNumber: string) {
  return {
    articleNumber,
    dataSupplierId: BOSCH,
    mfrName: 'Bosch',
    genericArticles: [
      {
        genericArticleId: BRAKE_DISC,
        genericArticleDescription: 'Part',
        legacyArticleId: 555,
      },
    ],
    images: [{ imageURL800: `https://img/${articleNumber}.jpg` }],
  };
}

describe('ArticleRowsTecDoc', () => {
  let call: jest.Mock;
  let tecdoc: ArticleRowsTecDoc;

  beforeEach(() => {
    call = jest.fn();
    tecdoc = new ArticleRowsTecDoc({ call } as unknown as TecDocTransport);
  });

  it('hydrates the given ids into rows, asking only for what a row renders', async () => {
    call.mockResolvedValueOnce({ articles: [record('A1')] });

    const rows = await tecdoc.getArticleRowsByLegacyIds([777, 778]);

    expect(call).toHaveBeenCalledWith('getArticles', {
      articleCountry: 'BG',
      lang: 'bg',
      legacyArticleIds: [777, 778],
      perPage: 2,
      page: 1,
      includeGenericArticles: true,
      includeArticleCriteria: true,
      includeImages: true,
    });
    expect(rows.map((row) => row.articleNumber)).toEqual(['A1']);
  });

  // OE numbers are the bulkiest field on an article — 34 to 61 on a filter,
  // roughly half a hydrated row — and `mapArticleSummary` reads neither them
  // nor the article text, so both were paid for and dropped.
  it('asks for nothing a row does not render', async () => {
    call.mockResolvedValueOnce({ articles: [record('A1')] });

    await tecdoc.getArticleRowsByLegacyIds([777]);

    const [, params] = call.mock.calls[0];
    for (const flag of [
      'includeAll',
      'includeOEMNumbers',
      'includeArticleText',
    ]) {
      expect(params).not.toHaveProperty(flag);
    }
  });

  /**
   * A call given 20 ids came back with 19 rows. Whatever the reason, the rows
   * TecDoc did return are worth showing, so a short answer is the answer — the
   * caller aligns it back to the ids it asked for.
   */
  it('answers with the rows it got when TecDoc returns fewer than asked', async () => {
    call.mockResolvedValueOnce({ articles: [record('A1'), record('A2')] });

    const rows = await tecdoc.getArticleRowsByLegacyIds([1, 2, 3]);

    expect(rows).toHaveLength(2);
  });

  it('does not call TecDoc for an empty id list', async () => {
    expect(await tecdoc.getArticleRowsByLegacyIds([])).toEqual([]);
    expect(call).not.toHaveBeenCalled();
  });
});
