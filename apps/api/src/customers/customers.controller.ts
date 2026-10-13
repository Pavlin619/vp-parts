import { Body, Controller, Get, Header, Patch, Post } from '@nestjs/common';
import type { CustomerProfileDto } from '@vp-parts-shop/shared';
import { CurrentUser } from '../auth';
import type { AuthenticatedUser } from '../auth';
import { CompleteProfileBodyDto } from './customers.dto';
import { CustomersService } from './customers.service';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get('me')
  @Header('Cache-Control', 'private, no-store')
  getProfile(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CustomerProfileDto> {
    return this.customers.getProfile(user.clerkId);
  }

  /** Called right after a Clerk sign-up, so the customer exists before the webhook lands. */
  @Post('me')
  register(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CustomerProfileDto> {
    return this.customers.register(user.clerkId);
  }

  @Patch('me')
  @Header('Cache-Control', 'private, no-store')
  completeProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() details: CompleteProfileBodyDto,
  ): Promise<CustomerProfileDto> {
    return this.customers.completeProfile(user.clerkId, details);
  }
}
