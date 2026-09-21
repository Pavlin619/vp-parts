import {
  ExecutionContext,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ClerkJwtStrategy } from './clerk-jwt.strategy';
import { AuthenticatedUser, JwtGuard } from './jwt.guard';

function contextFor(request: Partial<Request>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('JwtGuard', () => {
  const getAllAndOverride = jest.fn();
  const verifyToken = jest.fn();
  let guard: JwtGuard;

  beforeEach(() => {
    jest.resetAllMocks();
    guard = new JwtGuard(
      { getAllAndOverride } as unknown as Reflector,
      { verifyToken } as unknown as ClerkJwtStrategy,
    );
  });

  const asPublic = () => getAllAndOverride.mockReturnValue(true);
  const asProtected = () => getAllAndOverride.mockReturnValue(false);

  describe('a protected route', () => {
    it('rejects a request with no token', async () => {
      asProtected();

      await expect(
        guard.canActivate(contextFor({ headers: {} })),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a token Clerk does not verify', async () => {
      asProtected();
      verifyToken.mockRejectedValue(new Error('bad signature'));

      await expect(
        guard.canActivate(
          contextFor({ headers: { authorization: 'Bearer nope' } }),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('attaches the verified identity', async () => {
      asProtected();
      verifyToken.mockResolvedValue({
        sub: 'clerk-1',
        publicMetadata: { role: 'MECHANIC' },
      });
      const request = { headers: { authorization: 'Bearer good' } } as Request;

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect((request as Request & { user: AuthenticatedUser }).user).toEqual({
        clerkId: 'clerk-1',
        role: 'MECHANIC',
      });
    });
  });

  describe('a public route', () => {
    it('lets an anonymous request through with no identity', async () => {
      asPublic();
      const request = { headers: {} } as Request;

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(
        (request as Request & { user?: AuthenticatedUser }).user,
      ).toBeUndefined();
      expect(verifyToken).not.toHaveBeenCalled();
    });

    it('still attaches the identity when a valid token came along', async () => {
      asPublic();
      verifyToken.mockResolvedValue({ sub: 'clerk-1' });
      const request = { headers: { authorization: 'Bearer good' } } as Request;

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect((request as Request & { user: AuthenticatedUser }).user).toEqual({
        clerkId: 'clerk-1',
        role: undefined,
      });
    });

    it('stays anonymous rather than failing on a bad token', async () => {
      asPublic();
      verifyToken.mockRejectedValue(new Error('expired'));
      const request = { headers: { authorization: 'Bearer stale' } } as Request;

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(
        (request as Request & { user?: AuthenticatedUser }).user,
      ).toBeUndefined();
    });

    // An infra-level Clerk failure looks identical to a bad token from here,
    // but only the log line lets anyone tell the two apart later.
    it('logs why a token failed to verify, even though the request still proceeds', async () => {
      asPublic();
      verifyToken.mockRejectedValue(new Error('Clerk unreachable'));
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const request = { headers: { authorization: 'Bearer stale' } } as Request;

      await guard.canActivate(contextFor(request));

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Clerk unreachable'),
      );
      warn.mockRestore();
    });
  });
});
