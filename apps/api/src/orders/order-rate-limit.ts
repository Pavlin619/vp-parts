import { ExecutionContext } from '@nestjs/common';
import { ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';
import type { Response } from 'express';

export interface RateLimitBucket {
  name: string;
  key: string;
  limit: number;
  windowMs: number;
}

/** Counts one attempt in the throttler's storage, and refuses it once the bucket is full. */
export async function countAttempt(
  storage: ThrottlerStorage,
  context: ExecutionContext,
  { name, key, limit, windowMs }: RateLimitBucket,
): Promise<void> {
  const { isBlocked, timeToBlockExpire } = await storage.increment(
    `${name}:${key}`,
    windowMs,
    limit,
    windowMs,
    name,
  );

  if (isBlocked) {
    context
      .switchToHttp()
      .getResponse<Response>()
      .header('Retry-After', String(timeToBlockExpire));

    throw new ThrottlerException();
  }
}
