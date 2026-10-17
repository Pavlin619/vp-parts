import { Module } from '@nestjs/common';
import { ClerkJwtStrategy } from './clerk-jwt.strategy';
import { ClerkUsers } from './clerk-users';
import { ClerkWebhooks } from './clerk-webhooks';
import { InternalGuard } from './internal.guard';

@Module({
  providers: [ClerkJwtStrategy, ClerkUsers, ClerkWebhooks, InternalGuard],
  exports: [ClerkJwtStrategy, ClerkUsers, ClerkWebhooks, InternalGuard],
})
export class AuthModule {}
