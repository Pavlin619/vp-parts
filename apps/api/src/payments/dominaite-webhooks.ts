import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseWebhookEvent, verifyWebhook } from '@dominaite/merchant-sdk';
import type { DominaiteWebhookEvent } from '@dominaite/merchant-sdk';

/** A delivery Dominaite did not sign, signed too long ago, or that is not an event. */
export class InvalidWebhookError extends Error {}

@Injectable()
export class DominaiteWebhooks {
  private readonly signingSecret: string;

  constructor(config: ConfigService) {
    this.signingSecret = config.getOrThrow<string>('DOMINAITE_WEBHOOK_SECRET');
  }

  /**
   * Checks the signature over the exact bytes received, then parses them. The
   * signature's timestamp must be within 300 seconds of our clock.
   */
  verify(
    rawBody: Buffer | undefined,
    signatureHeader: string | undefined,
  ): DominaiteWebhookEvent {
    const payload = rawBody?.toString('utf8');

    if (
      !payload ||
      !signatureHeader ||
      !verifyWebhook(payload, signatureHeader, this.signingSecret)
    ) {
      throw new InvalidWebhookError('Dominaite webhook signature refused');
    }

    try {
      return parseWebhookEvent(payload);
    } catch (error) {
      throw new InvalidWebhookError(
        `Dominaite webhook unreadable: ${String(error)}`,
      );
    }
  }
}
