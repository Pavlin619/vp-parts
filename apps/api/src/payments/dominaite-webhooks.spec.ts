import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DominaiteWebhooks, InvalidWebhookError } from './dominaite-webhooks';

const VECTOR_SECRET =
  'whsec_abababababababababababababababababababababababababababababababab';
const VECTOR_TIMESTAMP = 1755700000;
const VECTOR_BODY =
  '{"id":"7f9c24e5-1d1f-4c0a-9b6c-2f3a4d5e6f70","type":"payment.succeeded","createdAt":"2026-08-20T14:00:00Z","data":{"transactionId":"0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0","status":"succeeded","previousStatus":"pending","kind":"sale","amount":8440,"grossAmount":8701,"surchargeAmount":261,"currency":"EUR","originalTransactionId":null,"idempotencyKey":"order-123"}}';
const VECTOR_SIGNATURE =
  't=1755700000,v1=5305bcf1302fdaba8f8c19a20c899e916fb4d2a7d8d547c62529ff87c4697b72';

function signed(
  body: string,
  timestamp: number,
  secret = VECTOR_SECRET,
): string {
  const mac = createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');

  return `t=${timestamp},v1=${mac}`;
}

describe('DominaiteWebhooks', () => {
  let webhooks: DominaiteWebhooks;

  beforeEach(async () => {
    jest.useFakeTimers({ now: VECTOR_TIMESTAMP * 1000 });

    const moduleRef = await Test.createTestingModule({
      providers: [
        DominaiteWebhooks,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) =>
              key === 'DOMINAITE_WEBHOOK_SECRET' ? VECTOR_SECRET : undefined,
          },
        },
      ],
    }).compile();

    webhooks = moduleRef.get(DominaiteWebhooks);
  });

  afterEach(() => jest.useRealTimers());

  it('accepts Dominaite’s offline vector and answers the event it carries', () => {
    const event = webhooks.verify(Buffer.from(VECTOR_BODY), VECTOR_SIGNATURE);

    expect(event).toMatchObject({
      id: '7f9c24e5-1d1f-4c0a-9b6c-2f3a4d5e6f70',
      type: 'payment.succeeded',
      data: {
        transactionId: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0',
        status: 'succeeded',
        amount: 8440,
        currency: 'EUR',
      },
    });
  });

  it.each([
    [
      'a body changed since it was signed',
      VECTOR_BODY.replace('8440', '1'),
      VECTOR_SIGNATURE,
    ],
    [
      'a body re-serialised with other spacing',
      JSON.stringify(JSON.parse(VECTOR_BODY), null, 1),
      VECTOR_SIGNATURE,
    ],
    [
      'a signature made with another secret',
      VECTOR_BODY,
      signed(VECTOR_BODY, VECTOR_TIMESTAMP, 'whsec_other'),
    ],
    ['a malformed signature header', VECTOR_BODY, 'v1=5305bcf1'],
    ['no signature header', VECTOR_BODY, undefined],
  ])('rejects %s', (_case, body, header) => {
    expect(() => webhooks.verify(Buffer.from(body), header)).toThrow(
      InvalidWebhookError,
    );
  });

  it('rejects a delivery with no body', () => {
    expect(() => webhooks.verify(undefined, VECTOR_SIGNATURE)).toThrow(
      InvalidWebhookError,
    );
  });

  it.each([
    ['older', -301],
    ['newer', 301],
  ])(
    'rejects a correct signature more than 300 seconds %s than our clock, so a captured delivery cannot be replayed',
    (_case, offsetSeconds) => {
      const timestamp = VECTOR_TIMESTAMP + offsetSeconds;

      expect(() =>
        webhooks.verify(
          Buffer.from(VECTOR_BODY),
          signed(VECTOR_BODY, timestamp),
        ),
      ).toThrow(InvalidWebhookError);
    },
  );

  it('accepts a correct signature inside the 300 seconds', () => {
    const timestamp = VECTOR_TIMESTAMP - 300;

    expect(() =>
      webhooks.verify(Buffer.from(VECTOR_BODY), signed(VECTOR_BODY, timestamp)),
    ).not.toThrow();
  });

  it('rejects a signed body that is not an event', () => {
    const body = '{"hello":"world"}';

    expect(() =>
      webhooks.verify(Buffer.from(body), signed(body, VECTOR_TIMESTAMP)),
    ).toThrow(InvalidWebhookError);
  });
});
