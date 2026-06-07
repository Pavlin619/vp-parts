import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ClerkJwtStrategy } from './clerk-jwt.strategy';
import { JwtGuard } from './jwt.guard';
import { InternalGuard } from './internal.guard';

@Module({
  providers: [
    ClerkJwtStrategy,
    InternalGuard,
    {
      provide: APP_GUARD,
      useClass: JwtGuard,
    },
  ],
  exports: [ClerkJwtStrategy, InternalGuard],
})
export class AuthModule {}
