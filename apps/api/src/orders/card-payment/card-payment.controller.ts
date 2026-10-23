import {
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { OrderPaymentSessionDto } from '@vp-parts-shop/shared';
import { CurrentUser } from '../../auth';
import type { AuthenticatedUser } from '../../auth';
import { OrderReferenceParamsDto } from '../orders.dto';
import { CardPaymentService } from './card-payment.service';
import { OrderPaymentRateLimitGuard } from './order-payment-rate-limit.guard';

@Controller('orders')
export class CardPaymentController {
  constructor(private readonly cardPayments: CardPaymentService) {}

  /** Opens the card order's payment, or answers the session still open. */
  @Post(':orderReference/payment')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @UseGuards(OrderPaymentRateLimitGuard)
  openPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { orderReference }: OrderReferenceParamsDto,
  ): Promise<OrderPaymentSessionDto> {
    return this.cardPayments.openPayment(user.clerkId, orderReference);
  }
}
