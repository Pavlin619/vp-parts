import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeliveryRequestRejectedException,
  DeliveryUnavailableException,
} from '../delivery.exceptions';
import { EcontRefusedException, EcontTransport } from './econt.transport';

const CONFIG: Record<string, string> = {
  ECONT_BASE_URL: 'https://demo.econt.test/ee/services',
  ECONT_OFFICES_BASE_URL: 'https://ee.econt.test/services',
  ECONT_USERNAME: 'user',
  ECONT_PASSWORD: 'secret',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('EcontTransport', () => {
  let fetchMock: jest.SpyInstance;
  let transport: EcontTransport;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    transport = new EcontTransport({
      get: (key: string) => CONFIG[key],
    } as unknown as ConfigService);
  });

  afterEach(() => jest.restoreAllMocks());

  it('posts JSON with basic auth to the account endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ label: {} }));

    await transport.call('Shipments/LabelService.createLabel', {
      mode: 'calculate',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://demo.econt.test/ee/services/Shipments/LabelService.createLabel.json',
    );
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from('user:secret').toString('base64')}`,
    );
    expect(JSON.parse(init.body)).toEqual({ mode: 'calculate' });
  });

  it('reads nomenclatures from their own endpoint, without credentials', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ offices: [] }));

    await transport.readNomenclature(
      'Nomenclatures/NomenclaturesService.getOffices',
      {
        countryCode: 'BGR',
      },
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://ee.econt.test/services/Nomenclatures/NomenclaturesService.getOffices.json',
    );
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('treats an unreachable courier as unavailable', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(
      transport.call('Any/Service.method', {}),
    ).rejects.toBeInstanceOf(DeliveryUnavailableException);
  });

  it('treats a server error as unavailable', async () => {
    fetchMock.mockResolvedValueOnce(new Response('oops', { status: 502 }));

    await expect(
      transport.call('Any/Service.method', {}),
    ).rejects.toBeInstanceOf(DeliveryUnavailableException);
  });

  it('treats rate limiting as unavailable, since a retry may succeed', async () => {
    fetchMock.mockResolvedValueOnce(new Response('slow down', { status: 429 }));

    await expect(
      transport.call('Any/Service.method', {}),
    ).rejects.toBeInstanceOf(DeliveryUnavailableException);
  });

  it('hands the caller the error tree of a refusal', async () => {
    const refusal = { type: 'ExInvalidParam', message: 'получател: ' };
    fetchMock.mockResolvedValueOnce(jsonResponse(refusal, 517));

    const error: unknown = await transport
      .call('Any/Service.method', {})
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(EcontRefusedException);
    expect((error as EcontRefusedException).refusal).toEqual(refusal);
  });

  it('treats an Econt error body as a rejected request and logs its innermost message', async () => {
    const logged = jest.spyOn(Logger.prototype, 'error');
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          type: 'ExInvalidParam',
          message: ' ',
          innerErrors: [
            {
              type: 'ExInvalidCity',
              message: 'Невалиднo населено място.',
              innerErrors: [],
            },
          ],
        },
        517,
      ),
    );

    await expect(
      transport.call('Any/Service.method', {}),
    ).rejects.toBeInstanceOf(DeliveryRequestRejectedException);
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining('ExInvalidCity: Невалиднo населено място.'),
    );
  });
});
