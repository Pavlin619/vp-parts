import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BotCheckFailedException } from './bot-check.exceptions';

const SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 10_000;

/** Siteverify's codes for a token that is no good; any other names our setup or Cloudflare. */
const VISITOR_ERROR_CODES = new Set([
  'missing-input-response',
  'invalid-input-response',
  'timeout-or-duplicate',
]);

interface SiteverifyOutcome {
  success: boolean;
  'error-codes': string[];
}

/**
 * Checks a Cloudflare Turnstile token server-side. Only a fault in the token is
 * the visitor's; our secret or Cloudflare failing is ours, and fails closed.
 */
@Injectable()
export class TurnstileVerifier {
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.secret = config.get<string>('TURNSTILE_SECRET_KEY')!;
  }

  /** Spends the token: Cloudflare accepts each one once, within five minutes of issuing it. */
  async verify(token: string): Promise<void> {
    const outcome = await this.siteverify(token);

    if (outcome.success) {
      return;
    }

    const errorCodes = outcome['error-codes'];

    if (errorCodes.every((code) => VISITOR_ERROR_CODES.has(code))) {
      throw new BotCheckFailedException();
    }

    throw new Error(`Turnstile refused our request (${errorCodes.join(', ')})`);
  }

  private async siteverify(token: string): Promise<SiteverifyOutcome> {
    const response = await this.post(token);

    if (!response.ok) {
      throw new Error(`Turnstile answered HTTP ${response.status}`);
    }

    return (await response.json()) as SiteverifyOutcome;
  }

  private async post(token: string): Promise<Response> {
    try {
      return await fetch(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: this.secret, response: token }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new Error(
        `Turnstile unreachable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
