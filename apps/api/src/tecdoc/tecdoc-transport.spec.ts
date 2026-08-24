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

/** `undefined` drops the key rather than setting it, as an absent env var does. */
function configWithProvider(providerId?: string): Record<string, string> {
  const values = { ...validConfig };

  if (providerId === undefined) {
    delete (values as Partial<typeof validConfig>).TECDOC_PROVIDER_ID;
  } else {
    values.TECDOC_PROVIDER_ID = providerId;
  }

  return values;
}

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

    // The live service reads entitlement from the API key and answers a call
    // with no `provider` in full, so an unconfigured one is left out entirely.
    // Sending `provider: null` instead earns "Access not allowed" on every call.
    it.each([
      ['unset', undefined],
      ['empty', ''],
    ])('omits the provider when it is %s', async (_label, providerId) => {
      respondWith({ status: 200 });

      await new TecDocTransport(
        configWith(configWithProvider(providerId)),
      ).call('getBrands', { lang: 'bg' });

      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
        getBrands: { lang: 'bg' },
      });
    });

    // A value that was meant to be a ProviderId and is malformed must not read
    // as "send none" and quietly work: nothing would then report the typo.
    it.each([
      ['non-numeric', 'TODO'],
      ['zero', '0'],
      ['negative', '-1'],
    ])('refuses to construct with a %s provider id', (_label, providerId) => {
      expect(
        () => new TecDocTransport(configWith(configWithProvider(providerId))),
      ).toThrow(/TECDOC_PROVIDER_ID/);
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

  describe('request deadline', () => {
    let signalUsed: AbortSignal | undefined;

    /** Mimics undici: settles only once the deadline aborts the request. */
    function stallUntilAborted(signal: AbortSignal): Promise<never> {
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason as Error));
      });
    }

    /**
     * Asserts the call really did end on its deadline. Without this a stalled
     * request could satisfy the exception assertion for an unrelated reason.
     */
    function expectTimedOut() {
      expect(signalUsed?.reason).toMatchObject({ name: 'TimeoutError' });
    }

    function withTimeout(timeoutMs: string) {
      return new TecDocTransport(
        configWith({ ...validConfig, TECDOC_TIMEOUT_MS: timeoutMs }),
      );
    }

    beforeEach(() => {
      signalUsed = undefined;
    });

    it('gives every call the configured deadline', async () => {
      const timeout = jest.spyOn(AbortSignal, 'timeout');
      respondWith({ status: 200 });

      await transport.call('getBrands', {});

      expect(timeout).toHaveBeenCalledWith(10_000);
      expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    });

    it('honours an overridden deadline', async () => {
      const timeout = jest.spyOn(AbortSignal, 'timeout');
      transport = withTimeout('2500');
      respondWith({ status: 200 });

      await transport.call('getBrands', {});

      expect(timeout).toHaveBeenCalledWith(2500);
    });

    // The bug this exists for: with no deadline, a hung connection blocks the
    // request for Node's 300s default and takes the handler pool with it.
    it('treats a stalled connection as retryable rather than hanging', async () => {
      transport = withTimeout('5');
      fetchMock.mockImplementation(
        (_url: string, init: { signal: AbortSignal }) => {
          signalUsed = init.signal;

          return stallUntilAborted(init.signal);
        },
      );

      await expect(transport.call('getBrands', {})).rejects.toBeInstanceOf(
        CatalogUnavailableException,
      );
      expectTimedOut();
    });

    // The deadline has to cover the body too — a response whose headers arrive
    // promptly can still stall mid-stream.
    it('applies the deadline to the body read as well as the connection', async () => {
      transport = withTimeout('5');
      fetchMock.mockImplementation(
        (_url: string, init: { signal: AbortSignal }) => {
          signalUsed = init.signal;

          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: '',
            json: () => stallUntilAborted(init.signal),
          });
        },
      );

      await expect(transport.call('getBrands', {})).rejects.toBeInstanceOf(
        CatalogUnavailableException,
      );
      expectTimedOut();
    });
  });

  // Deliberately unpaced: the transport applies no process-wide cap, so a
  // caller that fans out is the one that bounds itself. A cap here would have
  // to queue what it held back, and the deadline such a queue needs sheds
  // ordinary single-call reads as soon as enough visitors browse at once.
  describe('pacing', () => {
    it('sends every concurrent call rather than queueing any of them', async () => {
      let inFlight = 0;
      let peakInFlight = 0;

      fetchMock.mockImplementation(() => {
        inFlight += 1;
        peakInFlight = Math.max(peakInFlight, inFlight);

        return new Promise((resolve) => {
          setImmediate(() => {
            inFlight -= 1;
            resolve({
              ok: true,
              status: 200,
              statusText: '',
              json: () => Promise.resolve({ status: 200 }),
            });
          });
        });
      });

      await Promise.all(
        Array.from({ length: 20 }, () => transport.call('getBrands', {})),
      );

      expect(fetchMock).toHaveBeenCalledTimes(20);
      expect(peakInFlight).toBe(20);
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
