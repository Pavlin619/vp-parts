import { Body, Controller, Get, Header, Post } from '@nestjs/common';
import type { CustomerProfileDto } from '@vp-parts-shop/shared';
import { CurrentUser } from '../auth';
import type { AuthenticatedUser } from '../auth';
import { CreateCustomerBodyDto } from './customers.dto';
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

  /** Called once, right after a Clerk sign-up, to file the user as a customer. */
  @Post('me')
  register(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateCustomerBodyDto,
  ): Promise<CustomerProfileDto> {
    return this.customers.register(user.clerkId, body);
  }
}
