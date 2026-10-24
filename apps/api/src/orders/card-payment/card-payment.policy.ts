/** Each decline opens a fresh two-hour session, so an order takes only so many. */
export const MAX_PAYMENT_ATTEMPTS = 5;

/** As long as a session would have held it: an order nobody opened a payment for. */
export const UNOPENED_ORDER_HOLD_MS = 2 * 60 * 60 * 1000;

/**
 * How long past `expiresAt` an open session is still asked about before its
 * order is given up: a payment approved just before then still reads `pending`.
 */
export const GRACE_AFTER_EXPIRY_MS = 15 * 60 * 1000;
