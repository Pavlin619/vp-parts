import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export interface Email extends EmailContent {
  to: string;
  replyTo?: string;
}

const RESEND_EMAILS_URL = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;

export class EmailNotSentError extends Error {}

/**
 * Sends email through Resend. Its error messages may quote the recipient, so a
 * failure names only the status and the error's name — the logs stay free of PII.
 */
@Injectable()
export class EmailSender {
  private readonly apiKey: string;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('RESEND_API_KEY')!;
    this.from = config.get<string>('EMAIL_FROM')!;
  }

  /** Resend sends nothing new for a key it has seen in the last 24 hours. */
  async send(email: Email, idempotencyKey: string): Promise<void> {
    const response = await this.post(email, idempotencyKey);

    if (!response.ok) {
      throw new EmailNotSentError(
        `Resend answered HTTP ${response.status} (${await errorNameOf(response)})`,
      );
    }
  }

  private async post(email: Email, idempotencyKey: string): Promise<Response> {
    try {
      return await fetch(RESEND_EMAILS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(this.toResendEmail(email)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new EmailNotSentError(
        `Resend unreachable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private toResendEmail({ to, replyTo, subject, html, text }: Email) {
    return {
      from: this.from,
      to: [to],
      ...(replyTo && { reply_to: replyTo }),
      subject,
      html,
      text,
    };
  }
}

async function errorNameOf(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    name?: unknown;
  } | null;

  return typeof body?.name === 'string' ? body.name : 'unnamed error';
}
