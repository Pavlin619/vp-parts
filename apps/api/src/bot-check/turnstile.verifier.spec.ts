import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { BotCheckFailedException } from './bot-check.exceptions';
import { TurnstileVerifier } from './turnstile.verifier';

const TOKEN = '0.solved-turnstile-token';

function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function outcome(success: boolean, errorCodes: string[] = []): Response {
  return answer(200, { success, 'error-codes': errorCodes });
}

describe('TurnstileVerifier', () => {
  let verifier: TurnstileVerifier;
  const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();

  beforeEach(async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(outcome(true));
    global.fetch = fetchMock;

    const moduleRef = await Test.createTestingModule({
      providers: [
        TurnstileVerifier,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'TURNSTILE_SECRET_KEY' ? 'turnstile-secret' : undefined,
          },
        },
      ],
    }).compile();

    verifier = moduleRef.get(TurnstileVerifier);
  });

  it('asks Cloudflare whether the token was solved, with our secret', async () => {
    await verifier.verify(TOKEN);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    );
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({
      secret: 'turnstile-secret',
      response: TOKEN,
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ['a token that is not one', ['invalid-input-response']],
    ['a token already spent, or expired', ['timeout-or-duplicate']],
    ['no token', ['missing-input-response']],
    ['a refusal that names no reason', []],
  ])('refuses %s as a failed bot check', async (_case, errorCodes) => {
    fetchMock.mockResolvedValue(outcome(false, errorCodes));

    await expect(verifier.verify(TOKEN)).rejects.toBeInstanceOf(
      BotCheckFailedException,
    );
  });

  it.each([
    ['our secret is wrong', ['invalid-input-secret']],
    ['our request is malformed', ['bad-request']],
    ['Cloudflare failed', ['internal-error']],
    [
      'a visitor’s error comes with one of ours',
      ['invalid-input-response', 'invalid-input-secret'],
    ],
  ])('fails, not blaming the visitor, when %s', async (_case, errorCodes) => {
    fetchMock.mockResolvedValue(outcome(false, errorCodes));

    const failure = verifier.verify(TOKEN);

    await expect(failure).rejects.toThrow(errorCodes.join(', '));
    await expect(failure).rejects.not.toBeInstanceOf(BotCheckFailedException);
  });

  it('fails when Cloudflare answers with an HTTP error', async () => {
    fetchMock.mockResolvedValue(answer(503, {}));

    await expect(verifier.verify(TOKEN)).rejects.toThrow('HTTP 503');
  });

  it('fails when Cloudflare cannot be reached, never quoting the token', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const failure = verifier.verify(TOKEN);

    await expect(failure).rejects.toThrow(
      'Turnstile unreachable: fetch failed',
    );
    await expect(failure).rejects.not.toThrow(TOKEN);
  });
});
