import { RedisCache } from '../../redis';
import { ArticleReadCache } from './article-read';
import { ArticlesTecDoc } from './articles.tecdoc';

const BOSCH = 30;
const MANN = 94;

describe('ArticleReadCache', () => {
  let tecdoc: { getArticleDetails: jest.Mock };
  let cache: { cached: jest.Mock };
  let articleRead: ArticleReadCache;

  beforeEach(() => {
    tecdoc = { getArticleDetails: jest.fn().mockResolvedValue({}) };
    cache = {
      cached: jest.fn((_key: string, _ttl: number, loader: () => unknown) =>
        loader(),
      ),
    };

    articleRead = new ArticleReadCache(
      tecdoc as unknown as ArticlesTecDoc,
      cache as unknown as RedisCache,
    );
  });

  const keys = () => cache.cached.mock.calls.map(([key]) => key);

  it('caches the read under brand and number for 24h', async () => {
    await articleRead.read(BOSCH, 'A1');

    expect(cache.cached).toHaveBeenCalledWith(
      'tecdoc:article-read:30:A1',
      24 * 60 * 60,
      expect.any(Function),
    );
    expect(tecdoc.getArticleDetails).toHaveBeenCalledWith(
      BOSCH,
      'A1',
      undefined,
    );
  });

  // Two suppliers filing one number are two parts, and a key that omits the
  // brand serves the first one cached to everyone asking for the second.
  it('keys two brands sharing a number separately', async () => {
    await articleRead.read(BOSCH, 'OX 982D');
    await articleRead.read(MANN, 'OX 982D');

    expect(keys()).toEqual([
      'tecdoc:article-read:30:OX 982D',
      'tecdoc:article-read:94:OX 982D',
    ]);
  });

  /**
   * Nothing in the payload varies by vehicle while `fitsVehicle` is unresolved,
   * so keying on it stored one identical copy of a popular part per vehicle a
   * visitor happened to arrive from.
   */
  it('serves one entry regardless of the vehicle the visitor arrived from', async () => {
    await articleRead.read(BOSCH, 'A1', 10001);
    await articleRead.read(BOSCH, 'A1', 20002);
    await articleRead.read(BOSCH, 'A1');

    expect(new Set(keys())).toEqual(new Set(['tecdoc:article-read:30:A1']));
  });

  // Out of the cache key but still handed to the read, which is where the future
  // per-vehicle fit lookup needs it.
  it('passes the vehicle through to the TecDoc read', async () => {
    await articleRead.read(BOSCH, 'A1', 10001);

    expect(tecdoc.getArticleDetails).toHaveBeenCalledWith(BOSCH, 'A1', 10001);
  });

  // A miss must not be remembered: the exception has to reach the caller so a
  // TecDoc outage is not cached as "this part does not exist".
  it('lets a failed read through', async () => {
    tecdoc.getArticleDetails.mockRejectedValueOnce(new Error('tecdoc down'));

    await expect(articleRead.read(BOSCH, 'A1')).rejects.toThrow('tecdoc down');
  });
});
