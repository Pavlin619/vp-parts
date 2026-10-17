/** Tighter than the site-wide default: a call the cache cannot answer is a call to the courier. */
export const CARRIER_CALL_THROTTLE = {
  default: { limit: 20, ttl: 60_000 },
};
