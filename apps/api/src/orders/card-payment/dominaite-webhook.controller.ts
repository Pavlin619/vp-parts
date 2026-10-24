import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { DominaiteWebhookEvent } from '@dominaite/merchant-sdk';
import type { Request } from 'express';
import { Public } from '../../auth';
import { DominaiteWebhooks, InvalidWebhookError } from '../../payments';
import { PaymentOutcomeService } from './payment-outcome.service';

/**
 * Dominaite redelivers until this answers 2xx, so only a delivery it did not
 * sign is refused, and a failure to apply one is left to fail. The signature
 * guards the route, so Dominaite's retries are not rate-limited.
 */
@Controller('payments/dominaite/webhook')
export class DominaiteWebhookController {
  private readonly logger = new Logger(DominaiteWebhookController.name);

  constructor(
    private readonly webhooks: DominaiteWebhooks,
    private readonly outcomes: PaymentOutcomeService,
  ) {}

  @Public()
  @SkipThrottle()
  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-webhook-signature') signature: string | undefined,
  ): Promise<void> {
    const event = this.verify(request.rawBody, signature);

    await this.outcomes.applyWebhookEvent(event);
  }

  private verify(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): DominaiteWebhookEvent {
    try {
      return this.webhooks.verify(rawBody, signature);
    } catch (error) {
      if (!(error instanceof InvalidWebhookError)) {
        throw error;
      }

      this.logger.warn(`Rejected a Dominaite webhook: ${error.message}`);
      throw new BadRequestException();
    }
  }
}
