import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { EmailSender } from './email.sender';

const EMAIL = {
  to: 'ivan@example.com',
  replyTo: 'shop@example.com',
  subject: 'Поръчка VP-ORD-000042 е приета',
  html: '<p>Здравейте</p>',
  text: 'Здравейте',
};

const CONFIG: Record<string, string> = {
  RESEND_API_KEY: 're_test',
  EMAIL_FROM: 'orders@vp-parts.bg',
};

function answer(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('EmailSender', () => {
  let sender: EmailSender;
  const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();

  beforeEach(async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(answer(200, { id: 'email-1' }));
    global.fetch = fetchMock;

    const moduleRef = await Test.createTestingModule({
      providers: [
        EmailSender,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => CONFIG[key] },
        },
      ],
    }).compile();

    sender = moduleRef.get(EmailSender);
  });

  it('sends through Resend with the key that makes a retry a no-op', async () => {
    await sender.send(EMAIL, 'event-1:order-confirmation');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: 'Bearer re_test',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'event-1:order-confirmation',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'orders@vp-parts.bg',
      to: ['ivan@example.com'],
      reply_to: 'shop@example.com',
      subject: EMAIL.subject,
      html: EMAIL.html,
      text: EMAIL.text,
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('leaves out a reply-to it was not given', async () => {
    const { replyTo: _replyTo, ...withoutReplyTo } = EMAIL;

    await sender.send(withoutReplyTo, 'key');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).not.toHaveProperty('reply_to');
  });

  it('fails with Resend’s status and error name, never its message', async () => {
    fetchMock.mockResolvedValue(
      answer(422, {
        statusCode: 422,
        name: 'validation_error',
        message: 'Invalid `to` field: ivan@example',
      }),
    );

    const sending = sender.send(EMAIL, 'key');

    await expect(sending).rejects.toThrow(
      'Resend answered HTTP 422 (validation_error)',
    );
    await expect(sending).rejects.not.toThrow(/ivan/);
  });

  it('fails on an answer that is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('Bad gateway', { status: 502 }));

    await expect(sender.send(EMAIL, 'key')).rejects.toThrow(
      'Resend answered HTTP 502 (unnamed error)',
    );
  });

  it('fails when Resend cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(sender.send(EMAIL, 'key')).rejects.toThrow(
      'Resend unreachable: fetch failed',
    );
  });
});
