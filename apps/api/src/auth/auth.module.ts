import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ClerkJwtStrategy } from './clerk-jwt.strategy';
import { ClerkUsers } from './clerk-users';
import { ClerkWebhooks } from './clerk-webhooks';
import { JwtGuard } from './jwt.guard';
import { InternalGuard } from './internal.guard';

@Module({
  providers: [
    ClerkJwtStrategy,
    ClerkUsers,
    ClerkWebhooks,
    InternalGuard,
    {
      provide: APP_GUARD,
      useClass: JwtGuard,
    },
  ],
  exports: [ClerkJwtStrategy, ClerkUsers, ClerkWebhooks, InternalGuard],
})
export class AuthModule {}
