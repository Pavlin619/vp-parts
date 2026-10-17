import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DeliveryDestinationType, ShippingMethod } from '@vp-parts-shop/shared';
import {
  DeliveryAddressBodyDto,
  PLACE_ID_PATTERN,
  SUPPORTED_CARRIERS,
} from '../common';

export class DeliveryCarrierQueryDto {
  @IsIn(SUPPORTED_CARRIERS)
  carrier!: ShippingMethod;
}

export class DeliveryNameQueryDto extends DeliveryCarrierQueryDto {
  @Matches(PLACE_ID_PATTERN)
  placeId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  q!: string;
}

export class DeliveryAddressValidateBodyDto {
  @IsIn(SUPPORTED_CARRIERS)
  carrier!: ShippingMethod;

  @IsObject()
  @ValidateNested()
  @Type(() => DeliveryAddressBodyDto)
  address!: DeliveryAddressBodyDto;
}

export class DeliveryOfficeDestinationBodyDto {
  @IsIn([DeliveryDestinationType.OFFICE])
  type!: DeliveryDestinationType.OFFICE;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  officeCode!: string;
}

export class DeliveryAddressDestinationBodyDto {
  @IsIn([DeliveryDestinationType.ADDRESS])
  type!: DeliveryDestinationType.ADDRESS;

  @IsObject()
  @ValidateNested()
  @Type(() => DeliveryAddressBodyDto)
  address!: DeliveryAddressBodyDto;
}
