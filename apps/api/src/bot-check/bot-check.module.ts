import { Module } from '@nestjs/common';
import { TurnstileVerifier } from './turnstile.verifier';

@Module({
  providers: [TurnstileVerifier],
  exports: [TurnstileVerifier],
})
export class BotCheckModule {}
