import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { extractBearerToken } from './bearer-token';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ClerkJwtStrategy } from './clerk-jwt.strategy';

export interface AuthenticatedUser {
  clerkId: string;
  role?: string;
}

@Injectable()
export class JwtGuard implements CanActivate {
  private readonly logger = new Logger(JwtGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly clerkJwtStrategy: ClerkJwtStrategy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request);

    // A public route serves anyone, but it still wants to know who is asking
    // when the browser happened to send a token — a cart belongs to the
    // customer when there is one and to the device otherwise. A token that does
    // not verify leaves them anonymous rather than turning an open route into a
    // closed one.
    if (isPublic) {
      if (token) {
        await this.tryAttachUser(request, token);
      }

      return true;
    }

    if (!token) {
      throw new UnauthorizedException();
    }

    if (!(await this.tryAttachUser(request, token))) {
      throw new UnauthorizedException();
    }

    return true;
  }

  private async tryAttachUser(
    request: Request,
    token: string,
  ): Promise<boolean> {
    try {
      const payload = await this.clerkJwtStrategy.verifyToken(token);
      const meta = payload as { publicMetadata?: { role?: string } };

      (request as Request & { user: AuthenticatedUser }).user = {
        clerkId: payload.sub,
        role: meta.publicMetadata?.role,
      };

      return true;
    } catch (error) {
      // Covers both a genuinely invalid/expired token and an infrastructure
      // failure (Clerk outage, a misconfigured secret) — the two look identical
      // from here, but only the second is worth someone's attention.
      this.logger.warn(
        `Token verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      return false;
    }
  }
}
