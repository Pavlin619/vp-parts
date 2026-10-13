import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { WebhookEvent } from '@clerk/backend/webhooks';
import type { Request } from 'express';
import { ClerkWebhooks, Public } from '../auth';
import {
  ClerkIdentityIncompleteException,
  EmailAlreadyExistsException,
} from './customers.exceptions';
import { CustomersService } from './customers.service';

/**
 * Clerk's guarantee that every account gets a customer row: it retries until
 * this answers 2xx. See docs/AUTH.md.
 */
@Controller('webhooks/clerk')
export class ClerkWebhookController {
  private readonly logger = new Logger(ClerkWebhookController.name);

  constructor(
    private readonly webhooks: ClerkWebhooks,
    private readonly customers: CustomersService,
  ) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(@Req() request: RawBodyRequest<Request>): Promise<void> {
    const event = await this.verify(request);

    if (event.type === 'user.created') {
      await this.fileCustomer(event.data.id);
    }
  }

  private async verify(
    request: RawBodyRequest<Request>,
  ): Promise<WebhookEvent> {
    try {
      return await this.webhooks.verify(request);
    } catch (error) {
      this.logger.warn(`Rejected a Clerk webhook: ${String(error)}`);
      throw new BadRequestException();
    }
  }

  private async fileCustomer(clerkId: string): Promise<void> {
    try {
      await this.customers.register(clerkId);
    } catch (error) {
      if (!isPermanentFailure(error)) {
        throw error;
      }

      this.logger.error(
        `Clerk user ${clerkId} cannot be filed as a customer: ${error.constructor.name}`,
      );
    }
  }
}

function isPermanentFailure(
  error: unknown,
): error is ClerkIdentityIncompleteException | EmailAlreadyExistsException {
  return (
    error instanceof ClerkIdentityIncompleteException ||
    error instanceof EmailAlreadyExistsException
  );
}
