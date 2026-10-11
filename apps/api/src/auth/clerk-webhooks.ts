import { Injectable, RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyWebhook, WebhookEvent } from '@clerk/backend/webhooks';
import type { Request as ExpressRequest } from 'express';

@Injectable()
export class ClerkWebhooks {
  private readonly signingSecret: string;

  constructor(configService: ConfigService) {
    this.signingSecret = configService.getOrThrow<string>(
      'CLERK_WEBHOOK_SECRET',
    );
  }

  /** Rejects a request Clerk did not sign, or whose body changed since. */
  verify(request: RawBodyRequest<ExpressRequest>): Promise<WebhookEvent> {
    return verifyWebhook(toFetchRequest(request), {
      signingSecret: this.signingSecret,
    });
  }
}

/** The signature covers the exact bytes Clerk sent, so the parsed body will not do. */
function toFetchRequest(request: RawBodyRequest<ExpressRequest>): Request {
  const headers = new Headers();

  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === 'string') {
      headers.set(name, value);
    }
  }

  return new Request(`http://localhost${request.originalUrl}`, {
    method: 'POST',
    headers,
    body: request.rawBody?.toString('utf8'),
  });
}
