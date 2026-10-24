import { DominaiteClient, signRequest } from '@dominaite/merchant-sdk';
import { PaymentUnavailableException } from './payments.exceptions';
import {
  CheckoutKeySpentError,
  CheckoutSessionRequest,
  DominaiteGateway,
} from './dominaite.gateway';

const SECRET = 'dms_unit-test-secret';
const BASE_URL = 'https://api.staging.dominaite.com/payments';
const TRANSACTION_ID = '3f6c1a2e-8b4d-4c1f-9a7e-5d2b0c9e41a7';

const REQUEST: CheckoutSessionRequest = {
  orderReference: 'VP-ORD-000123',
  attempt: 1,
  amount: 5304,
  customer: {
    firstName: 'Мария',
    lastName: 'Иванова',
    email: 'maria@example.com',
    phone: '+359888765432',
  },
};

const SESSION = {
  transactionId: TRANSACTION_ID,
  orderId: 'dom_8QK2M4',
  cashierKey: 'ck_51f0c2',
  cashierToken: 'b7d94e10-2a6f-4c3b-8e51-0f9d7a3c6b28',
  amount: 5304,
  currency: 'EUR',
  expiresAt: '2026-10-22T12:00:00Z',
};

const STATUS = {
  transactionId: TRANSACTION_ID,
  orderId: 'dom_8QK2M4',
  orderReference: 'VP-ORD-000123',
  status: 'pending',
  amount: 5304,
  currency: 'EUR',
  isRecurring: false,
  createdAt: '2026-10-22T10:00:00Z',
  sequence: 0,
};

function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function sessionCreated(): Response {
  return answer(200, {
    success: true,
    data: { success: true, checkout: SESSION },
    metadata: {},
  });
}

function sessionRefused(errorCode: string): Response {
  return answer(200, {
    success: true,
    data: {
      success: false,
      errorCode,
      message: 'refused',
      transactionId: TRANSACTION_ID,
    },
  });
}

function statusRead(status: string): Response {
  return answer(200, { success: true, data: { ...STATUS, status } });
}

interface SentRequest {
  path: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

describe('DominaiteGateway', () => {
  const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();
  let gateway: DominaiteGateway;

  function sent(call = 0): SentRequest {
    const [url, init] = fetchMock.mock.calls[call];

    return {
      path: url.slice(BASE_URL.length),
      method: init.method!,
      headers: init.headers as Record<string, string>,
      body: (init.body as string | undefined) ?? '',
    };
  }

  beforeEach(() => {
    fetchMock.mockReset();

    gateway = new DominaiteGateway(
      new DominaiteClient({
        keyId: 'dmk_unit-test',
        secret: SECRET,
        baseUrl: BASE_URL,
        fetch: fetchMock,
        maxRetries: 0,
      }),
    );
  });

  describe('the signing recipe', () => {
    const VECTOR_SECRET =
      'dms_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    it.each([
      [
        'a POST',
        {
          method: 'POST',
          path: '/merchant-api/checkout/sessions',
          idempotencyKey: '00000000-0000-4000-8000-000000000001',
          body: '{"amount":2500,"currency":"EUR","orderReference":"order-1042"}',
        },
        '8f5fba0b29a8eea81b76a0e6d7119e79ec68f586910f77713b045652e5ce9b74',
      ],
      [
        'a GET, with no key and no body',
        {
          method: 'GET',
          path: '/merchant-api/checkout/sessions/00000000-0000-4000-8000-000000000002',
          idempotencyKey: '',
          body: '',
        },
        '70002896ec8411efb7754de6c49c2fd6f35bb2d001966978a2f573de1914e68d',
      ],
      [
        'a POST with a non-ASCII body',
        {
          method: 'POST',
          path: '/merchant-api/checkout/sessions',
          idempotencyKey: '00000000-0000-4000-8000-000000000003',
          body: '{"amount":2500,"currency":"EUR","orderReference":"order-1042","customer":{"firstName":"Анна","lastName":"Müller"}}',
        },
        'dd809cb0b902326704a380110c29d9f789cc355864e1ed1de663157342834010',
      ],
    ])(
      'signs %s as Dominaite’s offline vector does',
      (_case, input, expected) => {
        expect(
          signRequest({
            secret: VECTOR_SECRET,
            timestamp: '1755302400',
            ...input,
          }),
        ).toBe(expected);
      },
    );
  });

  describe('openCheckoutSession', () => {
    beforeEach(() => fetchMock.mockResolvedValue(sessionCreated()));

    it('opens a session for the order’s amount in euro cents', async () => {
      await gateway.openCheckoutSession(REQUEST);

      const request = sent();

      expect(request.method).toBe('POST');
      expect(request.path).toBe('/merchant-api/checkout/sessions');
      expect(JSON.parse(request.body)).toEqual({
        amount: 5304,
        currency: 'EUR',
        orderReference: 'VP-ORD-000123',
        language: 'bg',
        customer: {
          firstName: 'Мария',
          lastName: 'Иванова',
          email: 'maria@example.com',
          phone: '+359888765432',
        },
      });
    });

    it('derives the idempotency key from the order, its attempt and its amount', async () => {
      await gateway.openCheckoutSession({ ...REQUEST, attempt: 2 });

      expect(sent().headers['Idempotency-Key']).toBe(
        'checkout-2-VP-ORD-000123-5304-EUR',
      );
    });

    it('signs exactly the path and the body it sends', async () => {
      await gateway.openCheckoutSession(REQUEST);

      const { method, path, headers, body } = sent();

      expect(headers['X-Signature']).toBe(
        signRequest({
          secret: SECRET,
          timestamp: headers['X-Timestamp'],
          method,
          path,
          idempotencyKey: headers['Idempotency-Key'],
          body,
        }),
      );
    });

    it('sends no email for a payer who gave none', async () => {
      await gateway.openCheckoutSession({
        ...REQUEST,
        customer: { ...REQUEST.customer, email: null },
      });

      expect(JSON.parse(sent().body).customer).not.toHaveProperty('email');
    });

    it('answers what the widget needs and when the session expires', async () => {
      await expect(gateway.openCheckoutSession(REQUEST)).resolves.toEqual({
        transactionId: TRANSACTION_ID,
        cashierKey: 'ck_51f0c2',
        cashierToken: 'b7d94e10-2a6f-4c3b-8e51-0f9d7a3c6b28',
        amount: 5304,
        currency: 'EUR',
        expiresAt: new Date('2026-10-22T12:00:00Z'),
      });
    });

    it.each([
      ['ALREADY_PROCESSED', 'paid'],
      ['PRIOR_ATTEMPT_FAILED', 'failed'],
    ])(
      'says the key is spent when Dominaite answers %s',
      async (errorCode, outcome) => {
        fetchMock.mockResolvedValue(sessionRefused(errorCode));

        const failure = gateway.openCheckoutSession(REQUEST);

        await expect(failure).rejects.toBeInstanceOf(CheckoutKeySpentError);
        await expect(failure).rejects.toMatchObject({
          outcome,
          transactionId: TRANSACTION_ID,
        });
      },
    );

    it.each(['PAYMENT_PROCESSING_UNAVAILABLE', 'DUPLICATE_REQUEST'])(
      'is unavailable, to retry, when Dominaite answers %s',
      async (errorCode) => {
        fetchMock.mockResolvedValue(sessionRefused(errorCode));

        await expect(
          gateway.openCheckoutSession(REQUEST),
        ).rejects.toBeInstanceOf(PaymentUnavailableException);
      },
    );

    it('fails as our fault when the same key comes with another body', async () => {
      fetchMock.mockResolvedValue(sessionRefused('IDEMPOTENCY_KEY_REUSED'));

      const failure = gateway.openCheckoutSession(REQUEST);

      await expect(failure).rejects.toThrow('IDEMPOTENCY_KEY_REUSED');
      await expect(failure).rejects.not.toBeInstanceOf(
        PaymentUnavailableException,
      );
    });
  });

  describe('readCheckoutSession', () => {
    it('reads the session by its transaction id', async () => {
      fetchMock.mockResolvedValue(statusRead('pending'));

      await gateway.readCheckoutSession(TRANSACTION_ID);

      const { method, path, headers } = sent();

      expect(method).toBe('GET');
      expect(path).toBe(`/merchant-api/checkout/sessions/${TRANSACTION_ID}`);
      expect(headers).not.toHaveProperty('Idempotency-Key');
    });

    it.each([
      ['succeeded', { isPaid: true, isTerminal: true }],
      ['pending', { isPaid: false, isTerminal: false }],
      ['requires_capture', { isPaid: false, isTerminal: false }],
      ['failed', { isPaid: false, isTerminal: true }],
      ['abandoned', { isPaid: false, isTerminal: true }],
      ['a-status-added-later', { isPaid: false, isTerminal: false }],
    ])('reads %s as %o', async (status, outcome) => {
      fetchMock.mockResolvedValue(statusRead(status));

      await expect(
        gateway.readCheckoutSession(TRANSACTION_ID),
      ).resolves.toEqual({
        transactionId: TRANSACTION_ID,
        status,
        amount: 5304,
        currency: 'EUR',
        ...outcome,
      });
    });

    it('fails as our fault for a transaction Dominaite does not know', async () => {
      fetchMock.mockResolvedValue(
        answer(404, { success: false, errorCode: 'PAYMENT_NOT_FOUND' }),
      );

      await expect(
        gateway.readCheckoutSession(TRANSACTION_ID),
      ).rejects.not.toBeInstanceOf(PaymentUnavailableException);
    });
  });

  describe('refundPayment', () => {
    const REFUND = {
      transactionId: TRANSACTION_ID,
      idempotencyKey: `late-${TRANSACTION_ID}`,
      reason: 'VP-ORD-000123',
    };

    function refundQueued(): Response {
      return answer(202, {
        success: true,
        data: {
          refundId: `re_${'0'.repeat(32)}`,
          transactionId: TRANSACTION_ID,
          status: 'pending',
          currency: 'EUR',
        },
      });
    }

    function refundRefused(status: number, code: string): Response {
      return answer(status, {
        success: false,
        error: { code, message: 'refused' },
      });
    }

    it('refunds the whole payment under the key it is given', async () => {
      fetchMock.mockResolvedValue(refundQueued());

      await expect(gateway.refundPayment(REFUND)).resolves.toBe('queued');

      const { method, path, headers, body } = sent();
      expect(method).toBe('POST');
      expect(path).toBe(`/merchant-api/payments/${TRANSACTION_ID}/refunds`);
      expect(headers['Idempotency-Key']).toBe(`late-${TRANSACTION_ID}`);
      expect(JSON.parse(body)).toEqual({ reason: 'VP-ORD-000123' });
    });

    it('answers that nothing is left to refund when the payment is refunded already', async () => {
      fetchMock.mockResolvedValue(refundRefused(422, 'PAYMENT_NOT_REFUNDABLE'));

      await expect(gateway.refundPayment(REFUND)).resolves.toBe(
        'nothing-to-refund',
      );
    });

    it('is unavailable, to retry with the same key, while Dominaite is still on it', async () => {
      fetchMock.mockResolvedValue(refundRefused(409, 'DUPLICATE_REQUEST'));

      await expect(gateway.refundPayment(REFUND)).rejects.toBeInstanceOf(
        PaymentUnavailableException,
      );
    });

    it('fails as our fault for a payment Dominaite does not know', async () => {
      fetchMock.mockResolvedValue(refundRefused(404, 'PAYMENT_NOT_FOUND'));

      const failure = gateway.refundPayment(REFUND);

      await expect(failure).rejects.toThrow('PAYMENT_NOT_FOUND');
      await expect(failure).rejects.not.toBeInstanceOf(
        PaymentUnavailableException,
      );
    });
  });

  it.each([
    ['answers a 5xx', () => Promise.resolve(answer(502, 'bad gateway'))],
    ['cannot be reached', () => Promise.reject(new TypeError('fetch failed'))],
    [
      'throttles us',
      () =>
        Promise.resolve(
          answer(429, { success: false, errorCode: 'RATE_LIMIT_EXCEEDED' }),
        ),
    ],
  ])('is unavailable, to retry, when Dominaite %s', async (_case, reply) => {
    fetchMock.mockImplementation(reply);

    await expect(gateway.openCheckoutSession(REQUEST)).rejects.toBeInstanceOf(
      PaymentUnavailableException,
    );
    await expect(
      gateway.readCheckoutSession(TRANSACTION_ID),
    ).rejects.toBeInstanceOf(PaymentUnavailableException);
  });
});
