import { ConfigService } from '@nestjs/config';
import { TecDocTransport } from './tecdoc-transport';

function configWith(values: Record<string, string>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

describe('TecDocTransport', () => {
  const config = configWith({
    TECDOC_BASE_URL: 'https://tecdoc.example',
    TECDOC_API_KEY: 'secret-key',
    TECDOC_PROVIDER_ID: '12345',
  });

  let transport: TecDocTransport;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    transport = new TecDocTransport(config);
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('POSTs to the single JSON endpoint with the function-keyed body and provider', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: 1 }),
    });

    const result = await transport.call('getBrands', { lang: 'bg' });

    expect(result).toEqual({ ok: 1 });
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

  it('throws when the HTTP response is not ok', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });

    await expect(transport.call('getBrands', {})).rejects.toThrow(
      'TecDoc API error: 500',
    );
  });
});
