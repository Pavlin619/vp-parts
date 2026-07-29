import {
  FORWARDED_FOR_HEADER,
  WEB_ORIGIN_TOKEN_HEADER,
} from '@vp-parts-shop/shared';
import {
  ClientIpOptions,
  IncomingRequest,
  UNKNOWN_CLIENT_IP,
  resolveClientIp,
} from './client-ip';

const WEB_ORIGIN_TOKEN = 'web-origin-secret';

function requestFrom(
  headers: Record<string, string | string[] | undefined> = {},
  peer: { ip?: string; remoteAddress?: string } = { ip: '10.0.0.9' },
): IncomingRequest {
  return {
    headers,
    ip: peer.ip,
    socket: { remoteAddress: peer.remoteAddress },
  };
}

function options(overrides: Partial<ClientIpOptions> = {}): ClientIpOptions {
  return { trustedProxyCount: 0, ...overrides };
}

describe('resolveClientIp', () => {
  describe('with no trusted proxy in front', () => {
    it('uses the address of the peer that opened the connection', () => {
      const request = requestFrom({}, { ip: '203.0.113.7' });

      expect(resolveClientIp(request, options())).toBe('203.0.113.7');
    });

    it('ignores X-Forwarded-For entirely', () => {
      // Nothing vouched for it, so believing it would let any caller invent
      // their own bucket.
      const request = requestFrom(
        { [FORWARDED_FOR_HEADER]: '1.2.3.4' },
        { ip: '203.0.113.7' },
      );

      expect(resolveClientIp(request, options())).toBe('203.0.113.7');
    });

    it('falls back to the socket address when the framework reports no ip', () => {
      const request = requestFrom({}, { remoteAddress: '198.51.100.4' });

      expect(resolveClientIp(request, options())).toBe('198.51.100.4');
    });

    it('reports a single shared bucket when no address can be resolved', () => {
      const request = requestFrom({}, {});

      expect(resolveClientIp(request, options())).toBe(UNKNOWN_CLIENT_IP);
    });
  });

  describe('behind a proxy that appends to X-Forwarded-For', () => {
    const behindOneProxy = options({ trustedProxyCount: 1 });

    it('uses the only entry when the proxy is the first to write the header', () => {
      const request = requestFrom({ [FORWARDED_FOR_HEADER]: '203.0.113.7' });

      expect(resolveClientIp(request, behindOneProxy)).toBe('203.0.113.7');
    });

    it('ignores an address the caller injected before the proxy appended', () => {
      const request = requestFrom({
        [FORWARDED_FOR_HEADER]: '1.2.3.4, 203.0.113.7',
      });

      expect(resolveClientIp(request, behindOneProxy)).toBe('203.0.113.7');
    });

    it('counts back one entry per trusted proxy', () => {
      const request = requestFrom({
        [FORWARDED_FOR_HEADER]: '1.2.3.4, 203.0.113.7, 10.0.0.1',
      });

      expect(resolveClientIp(request, options({ trustedProxyCount: 2 }))).toBe(
        '203.0.113.7',
      );
    });

    it('falls back to the peer when the chain is shorter than configured', () => {
      // Fewer hops than expected means it did not arrive the way we trust.
      const request = requestFrom(
        { [FORWARDED_FOR_HEADER]: '203.0.113.7' },
        { ip: '10.0.0.9' },
      );

      expect(resolveClientIp(request, options({ trustedProxyCount: 3 }))).toBe(
        '10.0.0.9',
      );
    });

    it('tolerates the header arriving as repeated values', () => {
      const request = requestFrom({
        [FORWARDED_FOR_HEADER]: ['1.2.3.4', '203.0.113.7'],
      });

      expect(resolveClientIp(request, behindOneProxy)).toBe('203.0.113.7');
    });

    it('trims padding around the entries', () => {
      const request = requestFrom({
        [FORWARDED_FOR_HEADER]: '  1.2.3.4 ,   203.0.113.7  ',
      });

      expect(resolveClientIp(request, behindOneProxy)).toBe('203.0.113.7');
    });

    it('falls back to the peer for a blank header', () => {
      const request = requestFrom(
        { [FORWARDED_FOR_HEADER]: '  ,  ' },
        { ip: '10.0.0.9' },
      );

      expect(resolveClientIp(request, behindOneProxy)).toBe('10.0.0.9');
    });
  });

  describe('for a request forwarded by our own frontend', () => {
    const fromWebOrigin = options({
      trustedProxyCount: 1,
      webOriginToken: WEB_ORIGIN_TOKEN,
    });

    it('believes the browser address the frontend declares', () => {
      const request = requestFrom({
        [WEB_ORIGIN_TOKEN_HEADER]: WEB_ORIGIN_TOKEN,
        [FORWARDED_FOR_HEADER]: '203.0.113.7, 76.76.21.1',
      });

      expect(resolveClientIp(request, fromWebOrigin)).toBe('203.0.113.7');
    });

    it('falls back to the proxy chain when it forwards no client address', () => {
      const request = requestFrom({
        [WEB_ORIGIN_TOKEN_HEADER]: WEB_ORIGIN_TOKEN,
      });

      expect(resolveClientIp(request, fromWebOrigin)).toBe('10.0.0.9');
    });

    it('does not believe a caller presenting the wrong token', () => {
      const request = requestFrom({
        [WEB_ORIGIN_TOKEN_HEADER]: 'guessed',
        [FORWARDED_FOR_HEADER]: '1.2.3.4, 203.0.113.7',
      });

      expect(resolveClientIp(request, fromWebOrigin)).toBe('203.0.113.7');
    });

    it('trusts nobody while no token is configured', () => {
      // Fails closed: an unset secret can never mean "trust everyone".
      const request = requestFrom({
        [WEB_ORIGIN_TOKEN_HEADER]: WEB_ORIGIN_TOKEN,
        [FORWARDED_FOR_HEADER]: '1.2.3.4, 203.0.113.7',
      });

      expect(resolveClientIp(request, options({ trustedProxyCount: 1 }))).toBe(
        '203.0.113.7',
      );
    });
  });
});
