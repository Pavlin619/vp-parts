import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { DeliveryQuoteRequestDto, ShippingMethod } from '@vp-parts-shop/shared';

/** Must name only carriers registered under DELIVERY_CARRIERS in DeliveryModule. */
const SUPPORTED_CARRIERS = [ShippingMethod.ECONT];

export class DeliveryCarrierQueryDto {
  @IsIn(SUPPORTED_CARRIERS)
  carrier!: ShippingMethod;
}

export class DeliveryQuoteBodyDto implements DeliveryQuoteRequestDto {
  @IsIn(SUPPORTED_CARRIERS)
  carrier!: ShippingMethod;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  officeCode!: string;
}
