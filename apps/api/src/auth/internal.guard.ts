import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class InternalGuard implements CanActivate {
  private readonly internalApiToken: string;

  constructor(private readonly configService: ConfigService) {
    this.internalApiToken =
      this.configService.getOrThrow<string>('INTERNAL_API_TOKEN');
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (token !== this.internalApiToken) {
      throw new UnauthorizedException();
    }

    return true;
  }

  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
