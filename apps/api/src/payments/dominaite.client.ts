import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DominaiteClient } from '@dominaite/merchant-sdk';

export const DOMINAITE_CLIENT = Symbol('DOMINAITE_CLIENT');

const TIMEOUT_MS = 10_000;

/** The SDK signs, unwraps and retries; its log lines never carry the secret or a token. */
export function createDominaiteClient(config: ConfigService): DominaiteClient {
  const logger = new Logger(DominaiteClient.name);

  return new DominaiteClient({
    keyId: config.getOrThrow<string>('DOMINAITE_KEY_ID'),
    secret: config.getOrThrow<string>('DOMINAITE_SECRET'),
    baseUrl: config.getOrThrow<string>('DOMINAITE_BASE_URL'),
    timeoutMs: TIMEOUT_MS,
    userAgent: 'vp-parts-shop',
    onWarning: (message) => logger.warn(message),
    onDebug: (line) => logger.debug(line),
  });
}
