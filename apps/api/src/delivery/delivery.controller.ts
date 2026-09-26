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
  DeliveryOfficeDto,
  DeliveryQuoteDto,
  ParcelEstimateDto,
} from '@vp-parts-shop/shared';
import { Public } from '../auth';
import { CartRequesterOf } from '../cart';
import type { CartRequester } from '../cart';
import { DeliveryCarrierQueryDto, DeliveryQuoteBodyDto } from './delivery.dto';
import { DeliveryService } from './delivery.service';

// Tighter than the site-wide default: a quote the cache lacks is a call to the courier.
const QUOTE_RATE_LIMIT_WINDOW_MS = 60_000;
const QUOTE_RATE_LIMIT = 20;

/** Public for the same reason the cart is: a guest checks out too. */
@Public()
@Controller('delivery')
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  @Get('offices')
  @Header('Cache-Control', 'public, max-age=3600')
  listOffices(
    @Query() { carrier }: DeliveryCarrierQueryDto,
  ): Promise<DeliveryOfficeDto[]> {
    return this.delivery.listOffices(carrier);
  }

  @Get('parcel')
  @Header('Cache-Control', 'no-store')
  estimateParcel(
    @CartRequesterOf() requester: CartRequester,
    @Query() { carrier }: DeliveryCarrierQueryDto,
  ): Promise<ParcelEstimateDto> {
    return this.delivery.estimateParcel(requester, carrier);
  }

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: { limit: QUOTE_RATE_LIMIT, ttl: QUOTE_RATE_LIMIT_WINDOW_MS },
  })
  quote(
    @CartRequesterOf() requester: CartRequester,
    @Body() body: DeliveryQuoteBodyDto,
  ): Promise<DeliveryQuoteDto> {
    return this.delivery.quote(requester, body);
  }
}
