import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import type { AuthenticatedUser } from './jwt.guard';

export function currentUserOf(context: ExecutionContext): AuthenticatedUser {
  const { user } = context
    .switchToHttp()
    .getRequest<Request & { user?: AuthenticatedUser }>();

  if (!user) {
    throw new UnauthorizedException();
  }

  return user;
}

/** The signed-in user on a route `JwtGuard` protects. Never use on a `@Public()` route. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => currentUserOf(context),
);
