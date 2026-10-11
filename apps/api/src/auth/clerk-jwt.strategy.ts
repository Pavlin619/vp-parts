import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyToken } from '@clerk/backend';
import type { JwtPayload } from '@clerk/shared/types';

@Injectable()
export class ClerkJwtStrategy {
  private readonly secretKey: string;
  private readonly webOrigin: string;

  constructor(private readonly configService: ConfigService) {
    this.secretKey = this.configService.getOrThrow<string>('CLERK_SECRET_KEY');
    this.webOrigin = this.configService.getOrThrow<string>('CORS_ORIGIN');
    this.configService.getOrThrow<string>('CLERK_PUBLISHABLE_KEY');
  }

  verifyToken(token: string): Promise<JwtPayload> {
    return verifyToken(token, {
      secretKey: this.secretKey,
      authorizedParties: [this.webOrigin],
    });
  }
}
