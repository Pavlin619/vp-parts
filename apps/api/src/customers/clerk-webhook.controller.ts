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
  CustomerPhoneRequiredException,
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

    // An SSO user becomes fileable only once the phone lands in their metadata.
    if (event.type === 'user.created' || event.type === 'user.updated') {
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
      if (error instanceof CustomerPhoneRequiredException) {
        this.logger.warn(
          `Clerk user ${clerkId} has no phone yet; filed once they give one`,
        );
        return;
      }

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
