import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ClerkJwtStrategy } from './clerk-jwt.strategy';

export interface AuthenticatedUser {
  clerkId: string;
  role?: string;
}

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly clerkJwtStrategy: ClerkJwtStrategy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException();
    }

    try {
      const payload = await this.clerkJwtStrategy.verifyToken(token);
      const meta = payload as { publicMetadata?: { role?: string } };

      (request as Request & { user: AuthenticatedUser }).user = {
        clerkId: payload.sub,
        role: meta.publicMetadata?.role,
      };
    } catch {
      throw new UnauthorizedException();
    }

    return true;
  }

  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
