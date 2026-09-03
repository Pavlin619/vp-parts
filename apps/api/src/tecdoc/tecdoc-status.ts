/**
 * Pegasus 3.0 reports the outcome of a call **in the response body**, not only in
 * the HTTP status. Every response type in the WSDL extends `responseData` and
 * carries a mandatory `status` (int) plus an optional `statusText`; a successful
 * call is `status: 200`.
 *
 * A rejected call still arrives as HTTP 200. An unrecognised ProviderId, a wrong
 * API key or a non-whitelisted IP comes back as
 * `{ "status": 401, "statusText": "Access not allowed" }` with no payload — so a
 * transport that checks only `response.ok` hands an empty body to the mappers,
 * `data.articles ?? []` yields nothing, and the shop tells the customer the part
 * does not exist when in truth we were locked out. Reading this envelope is what
 * turns that class of silent failure into a visible one.
 */
export const TECDOC_SUCCESS_STATUS = 200;

/** The `status`/`statusText` envelope shared by every Pegasus 3.0 response. */
export interface TecDocResponseStatus {
  status?: number;
  statusText?: string;
}

/**
 * What a failed TecDoc call means for us. The distinction drives both the HTTP
 * status we return and the runbook the log entry points at — the three have very
 * different causes even though two of them look identical to the client.
 */
export enum TecDocFailure {
  /** Upstream is unreachable, throttling us or erroring. Worth retrying. */
  Unavailable = 'unavailable',
  /** Our ProviderId, API key or IP whitelisting is wrong. Needs an operator. */
  Denied = 'denied',
  /** TecDoc refused the request we built. Our bug, needs a code change. */
  Rejected = 'rejected',
}

/**
 * The TecDoc `status` values we can name. Deliberately plain numbers rather
 * than Nest's `HttpStatus`: the codes are HTTP-shaped and TecDoc reuses their
 * meanings, but the value being classified is whatever the response body
 * carried — it is not an `HttpStatus` and must not be typed as one.
 */
const TECDOC_BAD_REQUEST = 400;
const TECDOC_UNAUTHORIZED = 401;
const TECDOC_FORBIDDEN = 403;
const TECDOC_TOO_MANY_REQUESTS = 429;

/**
 * Classifies a TecDoc `status` (or an HTTP status from the same call — the codes
 * are HTTP-shaped and TecDoc reuses their meanings).
 *
 * The switch covers the codes we can name; everything else falls through to
 * {@link classifyByStatusClass}. That fallback is not laziness — TecAlliance
 * publishes no enum, so an exhaustive `case` list would be invented rather than
 * specified.
 *
 * Two are confirmed against the live endpoint. `400` carries a `statusText`
 * naming the offending field and is always our bug: `Field 'perPage' must be >
 * 0 and <= 1000`, `Field 'page' must be > 0`, `Field 'numberType' has an
 * invalid value:12345.`, and `Sorting of criteria facets is not enabled for
 * this account` — the last of which is an entitlement rather than a malformed
 * request, but still a call we should not have made. `401` is "Access not
 * allowed", returned for a ProviderId that is not ours. Nothing produced a 403,
 * a 429 or a 5xx, so those two cases stand on the HTTP meanings alone. Note
 * that an empty `searchQuery` is answered `200`, not a rejection.
 */
export function classifyTecDocStatus(status: number): TecDocFailure {
  switch (status) {
    case TECDOC_UNAUTHORIZED:
    case TECDOC_FORBIDDEN:
      return TecDocFailure.Denied;

    case TECDOC_BAD_REQUEST:
      return TecDocFailure.Rejected;

    case TECDOC_TOO_MANY_REQUESTS:
      return TecDocFailure.Unavailable;

    default:
      return classifyByStatusClass(status);
  }
}

/**
 * Anything unrecognised is `Unavailable`: that is the retryable, non-alarming
 * reading, and an outage is a likelier cause of an unexpected code than a
 * request we built wrong.
 */
function classifyByStatusClass(status: number): TecDocFailure {
  if (status >= 500) {
    return TecDocFailure.Unavailable;
  }

  if (status >= 400) {
    return TecDocFailure.Rejected;
  }

  return TecDocFailure.Unavailable;
}
