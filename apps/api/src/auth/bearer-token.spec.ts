import { Request } from 'express';
import { extractBearerToken } from './bearer-token';

function requestWith(authorization?: string): Request {
  return { headers: { authorization } } as Request;
}

describe('extractBearerToken', () => {
  it('reads the token out of a Bearer authorization header', () => {
    expect(extractBearerToken(requestWith('Bearer abc123'))).toBe('abc123');
  });

  it('returns undefined when there is no authorization header', () => {
    expect(extractBearerToken(requestWith())).toBeUndefined();
  });

  it('returns undefined for a non-Bearer scheme', () => {
    expect(extractBearerToken(requestWith('Basic abc123'))).toBeUndefined();
  });
});
