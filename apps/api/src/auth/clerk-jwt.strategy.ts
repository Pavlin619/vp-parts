import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyToken } from '@clerk/backend';
import type { JwtPayload } from '@clerk/shared/types';

@Injectable()
export class ClerkJwtStrategy {
  private readonly secretKey: string;

  constructor(private readonly configService: ConfigService) {
    this.secretKey = this.configService.getOrThrow<string>('CLERK_SECRET_KEY');
    this.configService.getOrThrow<string>('CLERK_PUBLISHABLE_KEY');
  }

  verifyToken(token: string): Promise<JwtPayload> {
    return verifyToken(token, { secretKey: this.secretKey });
  }
}
