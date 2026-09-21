export const FORWARDED_FOR_HEADER = 'x-forwarded-for';

/**
 * Proves a request came from our own Next.js server rather than an arbitrary
 * caller, so the client address it forwards can be believed. Deliberately not
 * `Authorization` (that carries the end user's Clerk JWT on the same requests)
 * and not `INTERNAL_API_TOKEN` — the frontend and the backoffice are separate
 * trust domains.
 */
export const WEB_ORIGIN_TOKEN_HEADER = 'x-web-origin-token';

/**
 * Names the cart a guest owns. Sent on every cart request and returned on the
 * one that mints it.
 *
 * A header rather than a cookie: the shop and the API are on different sites,
 * so a `SameSite=Lax` cookie would never be sent and `SameSite=None` is on
 * borrowed time. The token names one cart and grants nothing else.
 */
export const CART_TOKEN_HEADER = 'x-cart-token';
