import { createHmac, randomBytes } from 'node:crypto';
import { RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { ClerkWebhooks } from './clerk-webhooks';

describe('ClerkWebhooks', () => {
  const key = randomBytes(24);
  const secret = `whsec_${key.toString('base64')}`;
  const config = {
    getOrThrow: (name: string) =>
      name === 'CLERK_WEBHOOK_SECRET' ? secret : `${name}-value`,
  } as unknown as ConfigService;

  const EVENT = {
    type: 'user.created',
    object: 'event',
    data: { id: 'user_1' },
    timestamp: 1_760_000_000_000,
    instance_id: 'ins_1',
  };

  const sign = (id: string, timestamp: string, body: string) =>
    `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')}`;

  const requestWith = (
    body: string,
    headers: Record<string, string | string[]>,
  ) =>
    ({
      originalUrl: '/webhooks/clerk',
      headers,
      rawBody: Buffer.from(body),
    }) as unknown as RawBodyRequest<Request>;

  const signedRequest = (body: string, signature?: string) => {
    const timestamp = String(Math.floor(Date.now() / 1000));

    return requestWith(body, {
      'svix-id': 'msg_1',
      'svix-timestamp': timestamp,
      'svix-signature': signature ?? sign('msg_1', timestamp, body),
      'content-type': 'application/json',
    });
  };

  let webhooks: ClerkWebhooks;

  beforeEach(() => {
    webhooks = new ClerkWebhooks(config);
  });

  it('returns the event of a request Clerk signed', async () => {
    const event = await webhooks.verify(signedRequest(JSON.stringify(EVENT)));

    expect(event).toMatchObject({
      type: 'user.created',
      data: { id: 'user_1' },
    });
  });

  it('rejects a body changed after it was signed', async () => {
    const body = JSON.stringify(EVENT);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const tampered = JSON.stringify({ ...EVENT, data: { id: 'user_2' } });

    await expect(
      webhooks.verify(signedRequest(tampered, sign('msg_1', timestamp, body))),
    ).rejects.toThrow();
  });

  it('rejects a request without the signature headers', async () => {
    await expect(
      webhooks.verify(requestWith(JSON.stringify(EVENT), {})),
    ).rejects.toThrow();
  });
});
