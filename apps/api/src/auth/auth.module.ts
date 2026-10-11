import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ClerkJwtStrategy } from './clerk-jwt.strategy';
import { ClerkUsers } from './clerk-users';
import { JwtGuard } from './jwt.guard';
import { InternalGuard } from './internal.guard';

@Module({
  providers: [
    ClerkJwtStrategy,
    ClerkUsers,
    InternalGuard,
    {
      provide: APP_GUARD,
      useClass: JwtGuard,
    },
  ],
  exports: [ClerkJwtStrategy, ClerkUsers, InternalGuard],
})
export class AuthModule {}
