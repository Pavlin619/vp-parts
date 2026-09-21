import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { extractBearerToken } from './bearer-token';

@Injectable()
export class InternalGuard implements CanActivate {
  private readonly internalApiToken: string;

  constructor(private readonly configService: ConfigService) {
    this.internalApiToken =
      this.configService.getOrThrow<string>('INTERNAL_API_TOKEN');
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request);

    if (token !== this.internalApiToken) {
      throw new UnauthorizedException();
    }

    return true;
  }
}
