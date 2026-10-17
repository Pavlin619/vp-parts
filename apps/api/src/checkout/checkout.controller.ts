import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  CartTotalsDto,
  DeliveryQuoteDto,
  ParcelEstimateDto,
} from '@vp-parts-shop/shared';
import { Public } from '../auth';
import { CartRequesterOf } from '../cart';
import type { CartRequester } from '../cart';
import { CARRIER_CALL_THROTTLE, DeliveryCarrierQueryDto } from '../delivery';
import { DeliveryQuoteBodyDto } from './checkout.dto';
import { CheckoutService } from './checkout.service';

/** Public for the same reason the cart is: a guest checks out too. Priced live, so never cached. */
@Public()
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Get('totals')
  @Header('Cache-Control', 'no-store')
  getTotals(
    @CartRequesterOf() requester: CartRequester,
  ): Promise<CartTotalsDto> {
    return this.checkout.totals(requester);
  }

  @Get('parcel')
  @Header('Cache-Control', 'no-store')
  estimateParcel(
    @CartRequesterOf() requester: CartRequester,
    @Query() { carrier }: DeliveryCarrierQueryDto,
  ): Promise<ParcelEstimateDto> {
    return this.checkout.estimateParcel(requester, carrier);
  }

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @Throttle(CARRIER_CALL_THROTTLE)
  quote(
    @CartRequesterOf() requester: CartRequester,
    @Body() body: DeliveryQuoteBodyDto,
  ): Promise<DeliveryQuoteDto> {
    return this.checkout.quote(requester, body);
  }
}
