import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  DeliveryDestinationType,
  DeliveryQuoteRequestDto,
  ShippingMethod,
} from '@vp-parts-shop/shared';
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

export class DeliveryQuoteBodyDto implements DeliveryQuoteRequestDto {
  @IsIn(SUPPORTED_CARRIERS)
  carrier!: ShippingMethod;

  @IsObject()
  @ValidateNested()
  @Type(() => Object, {
    keepDiscriminatorProperty: true,
    discriminator: {
      property: 'type',
      subTypes: [
        {
          value: DeliveryOfficeDestinationBodyDto,
          name: DeliveryDestinationType.OFFICE,
        },
        {
          value: DeliveryAddressDestinationBodyDto,
          name: DeliveryDestinationType.ADDRESS,
        },
      ],
    },
  })
  destination!:
    | DeliveryOfficeDestinationBodyDto
    | DeliveryAddressDestinationBodyDto;

  @IsBoolean()
  isCashOnDelivery!: boolean;
}
