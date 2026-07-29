import {
  FORWARDED_FOR_HEADER,
  WEB_ORIGIN_TOKEN_HEADER,
} from '@vp-parts-shop/shared';

/** Shared by every caller we cannot attribute, so hiding earns no allowance. */
export const UNKNOWN_CLIENT_IP = 'unknown';

/** Structural so the throttler's untyped `req` satisfies it without a cast. */
export interface IncomingRequest {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}

export interface ClientIpOptions {
  /** Proxies appending to `X-Forwarded-For` in front of us: 1 behind the LB. */
  trustedProxyCount: number;
  /** Secret our frontend presents. Unset means no caller is ever believed. */
  webOriginToken?: string;
}

/**
 * Works out who to bill a request to for rate limiting.
 *
 * The connection's address is wrong twice over here: behind the load balancer
 * it is the balancer, and for a server-rendered page it is a Vercel egress
 * address. Either collapses every visitor into one bucket.
 *
 * `X-Forwarded-For` fixes that but anyone can send it, so two rules keep it
 * honest. A proxy *appends* what it saw, so the entry our own balancer wrote is
 * the last one — counting from the right yields an address the caller cannot
 * choose, however much they prepend. And our frontend, the one caller relaying
 * a browser we never see, proves itself with a shared secret before the address
 * it declares is believed.
 */
export function resolveClientIp(
  request: IncomingRequest,
  options: ClientIpOptions,
): string {
  const forwardedFor = parseForwardedFor(request);

  if (isTrustedWebOrigin(request, options) && forwardedFor.length > 0) {
    return forwardedFor[0];
  }

  return (
    proxyReportedIp(forwardedFor, options.trustedProxyCount) ??
    directPeerIp(request)
  );
}

function parseForwardedFor(request: IncomingRequest): string[] {
  const raw = request.headers?.[FORWARDED_FOR_HEADER];
  const chain = Array.isArray(raw) ? raw.join(',') : (raw ?? '');

  return chain
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function isTrustedWebOrigin(
  request: IncomingRequest,
  options: ClientIpOptions,
): boolean {
  if (!options.webOriginToken) {
    return false;
  }

  return request.headers?.[WEB_ORIGIN_TOKEN_HEADER] === options.webOriginToken;
}

function proxyReportedIp(
  forwardedFor: string[],
  trustedProxyCount: number,
): string | undefined {
  if (trustedProxyCount <= 0) {
    return undefined;
  }

  // A chain shorter than the hop count did not arrive the way we expect, so it
  // earns no weight — the out-of-range read falls back to the peer below.
  return forwardedFor[forwardedFor.length - trustedProxyCount];
}

function directPeerIp(request: IncomingRequest): string {
  return request.ip ?? request.socket?.remoteAddress ?? UNKNOWN_CLIENT_IP;
}
