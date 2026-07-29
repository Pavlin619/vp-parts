export const FORWARDED_FOR_HEADER = 'x-forwarded-for';

/**
 * Proves a request came from our own Next.js server rather than an arbitrary
 * caller, so the client address it forwards can be believed. Deliberately not
 * `Authorization` (that carries the end user's Clerk JWT on the same requests)
 * and not `INTERNAL_API_TOKEN` — the frontend and the backoffice are separate
 * trust domains.
 */
export const WEB_ORIGIN_TOKEN_HEADER = 'x-web-origin-token';
