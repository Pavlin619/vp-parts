import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CatalogRequestRejectedException,
  CatalogUnavailableException,
} from './catalog.exception';
import { TecDocTransport } from './tecdoc-transport';

function configWith(values: Record<string, string>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

const validConfig = {
  TECDOC_BASE_URL: 'https://tecdoc.example',
  TECDOC_API_KEY: 'secret-key',
  TECDOC_PROVIDER_ID: '12345',
};

describe('TecDocTransport', () => {
  let transport: TecDocTransport;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    transport = new TecDocTransport(configWith(validConfig));
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function respondWith(
    body: unknown,
    init: { ok?: boolean; status?: number } = {},
  ) {
    fetchMock.mockResolvedValueOnce({
      ok: init.ok ?? true,
      status: init.status ?? 200,
      statusText: '',
      json: () => Promise.resolve(body),
    });
  }

  describe('provider id', () => {
    it('POSTs to the single JSON endpoint with the function-keyed body and provider', async () => {
      respondWith({ ok: 1, status: 200 });

      const result = await transport.call('getBrands', { lang: 'bg' });

      expect(result).toEqual({ ok: 1, status: 200 });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        'https://tecdoc.example/services/TecdocToCatDLB.jsonEndpoint',
      );
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({
        'X-Api-Key': 'secret-key',
        'Content-Type': 'application/json',
      });
      expect(JSON.parse(init.body)).toEqual({
        getBrands: { provider: 12345, lang: 'bg' },
      });
    });

    // Without this guard the provider is serialised as `provider: null` and every
    // call comes back "Access not allowed" — a config bug wearing an auth error's
    // clothes.
    it.each([
      ['missing', undefined],
      ['non-numeric', 'TODO'],
      ['zero', '0'],
    ])('refuses to construct with a %s provider id', (_label, providerId) => {
      const values: Record<string, string> = { ...validConfig };
      if (providerId === undefined) {
        delete values.TECDOC_PROVIDER_ID;
      } else {
        values.TECDOC_PROVIDER_ID = providerId;
      }

      expect(() => new TecDocTransport(configWith(values))).toThrow(
        /TECDOC_PROVIDER_ID/,
      );
    });
  });

  describe('failure classification', () => {
    it('treats an unreachable service as retryable', async () => {
      fetchMock.mockRejectedValueOnce(new Error('socket hang up'));

      await expect(transport.call('getBrands', {})).rejects.toBeInstanceOf(
        CatalogUnavailableException,
      );
    });

    it('treats an HTTP 500 as retryable', async () => {
      respondWith({}, { ok: false, status: 500 });

      await expect(transport.call('getBrands', {})).rejects.toBeInstanceOf(
        CatalogUnavailableException,
      );
    });

    it('treats a non-JSON body as retryable', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: '',
        json: () => Promise.reject(new SyntaxError('Unexpected token <')),
      });

      await expect(transport.call('getBrands', {})).rejects.toBeInstanceOf(
        CatalogUnavailableException,
      );
    });

    // The important one: TecDoc reports "Access not allowed" as an in-body status
    // on an HTTP 200. Reading only response.ok returned this payload as data, and
    // `data.articles ?? []` then rendered a lockout as "no parts found".
    it('rejects an in-body error status even though the HTTP call succeeded', async () => {
      respondWith({ status: 401, statusText: 'Access not allowed' });

      await expect(transport.call('getArticles', {})).rejects.toBeInstanceOf(
        CatalogRequestRejectedException,
      );
    });

    it('treats an in-body 503 as retryable', async () => {
      respondWith({ status: 503, statusText: 'Service unavailable' });

      await expect(transport.call('getArticles', {})).rejects.toBeInstanceOf(
        CatalogUnavailableException,
      );
    });

    it('treats an in-body 400 as our own bad request', async () => {
      respondWith({ status: 400, statusText: 'Invalid parameter' });

      await expect(transport.call('getArticles', {})).rejects.toBeInstanceOf(
        CatalogRequestRejectedException,
      );
    });

    // The client is told a bare INTERNAL_ERROR: "Access not allowed" describes
    // our credentials, not the caller's request, and belongs only in the log.
    it('keeps the upstream statusText out of the response body', async () => {
      respondWith({ status: 401, statusText: 'Access not allowed' });

      const thrown = await transport
        .call('getArticles', {})
        .then(() => null)
        .catch((error: HttpException) => error);

      expect(thrown?.getResponse()).toEqual({
        statusCode: 500,
        errorCode: 'INTERNAL_ERROR',
      });
    });
  });

  describe('success envelope', () => {
    it('passes a status 200 payload through', async () => {
      respondWith({ status: 200, articles: [{ articleNumber: 'A1' }] });

      await expect(transport.call('getArticles', {})).resolves.toMatchObject({
        articles: [{ articleNumber: 'A1' }],
      });
    });

    // Tolerant on purpose — see assertSucceeded. A function whose envelope we
    // have not confirmed must keep working rather than fail closed.
    it('accepts a payload with no status field', async () => {
      respondWith({ articles: [] });

      await expect(transport.call('getArticles', {})).resolves.toEqual({
        articles: [],
      });
    });
  });
});
