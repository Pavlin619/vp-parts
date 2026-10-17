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
  DeliveryAddressValidationDto,
  DeliveryOfficeDto,
  DeliveryPlaceDto,
  DeliveryQuarterDto,
  DeliveryStreetDto,
} from '@vp-parts-shop/shared';
import { Public } from '../auth';
import {
  DeliveryAddressValidateBodyDto,
  DeliveryCarrierQueryDto,
  DeliveryNameQueryDto,
} from './delivery.dto';
import { DeliveryService } from './delivery.service';
import { CARRIER_CALL_THROTTLE } from './delivery.throttle';

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

  @Get('places')
  @Header('Cache-Control', 'public, max-age=3600')
  listPlaces(
    @Query() { carrier }: DeliveryCarrierQueryDto,
  ): Promise<DeliveryPlaceDto[]> {
    return this.delivery.listPlaces(carrier);
  }

  @Get('address-places')
  @Header('Cache-Control', 'public, max-age=3600')
  listAddressPlaces(
    @Query() { carrier }: DeliveryCarrierQueryDto,
  ): Promise<DeliveryPlaceDto[]> {
    return this.delivery.listAddressPlaces(carrier);
  }

  @Get('streets')
  @Header('Cache-Control', 'public, max-age=3600')
  findStreets(
    @Query() { carrier, placeId, q }: DeliveryNameQueryDto,
  ): Promise<DeliveryStreetDto[]> {
    return this.delivery.findStreets(carrier, placeId, q);
  }

  @Get('quarters')
  @Header('Cache-Control', 'public, max-age=3600')
  findQuarters(
    @Query() { carrier, placeId, q }: DeliveryNameQueryDto,
  ): Promise<DeliveryQuarterDto[]> {
    return this.delivery.findQuarters(carrier, placeId, q);
  }

  @Post('address/validate')
  @HttpCode(HttpStatus.OK)
  @Throttle(CARRIER_CALL_THROTTLE)
  validateAddress(
    @Body() { carrier, address }: DeliveryAddressValidateBodyDto,
  ): Promise<DeliveryAddressValidationDto> {
    return this.delivery.validateAddress(carrier, address);
  }
}
