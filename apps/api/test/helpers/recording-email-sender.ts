import type { Email } from '../../src/email';

/** Stands in for Resend in every e2e suite: it records, and never sends. */
export class RecordingEmailSender {
  readonly sent: { email: Email; idempotencyKey: string }[] = [];

  send(email: Email, idempotencyKey: string): Promise<void> {
    this.sent.push({ email, idempotencyKey });

    return Promise.resolve();
  }
}
