import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsObject, ValidateNested } from 'class-validator';
import {
  DeliveryDestinationType,
  DeliveryQuoteRequestDto,
  ShippingMethod,
} from '@vp-parts-shop/shared';
import { SUPPORTED_CARRIERS } from '../common';
import {
  DeliveryAddressDestinationBodyDto,
  DeliveryOfficeDestinationBodyDto,
} from '../delivery';

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
