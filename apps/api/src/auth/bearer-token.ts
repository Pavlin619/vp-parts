import { Request } from 'express';

/** The `Bearer <token>` scheme, however the request is asking to be authenticated. */
export function extractBearerToken(request: Request): string | undefined {
  const [type, token] = request.headers.authorization?.split(' ') ?? [];
  return type === 'Bearer' ? token : undefined;
}
