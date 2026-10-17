import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  DeliveryMethod,
  PaymentMethod,
  PlaceOrderRequestDto,
  ShippingMethod,
} from '@vp-parts-shop/shared';
import { DeliveryAddressBodyDto, SUPPORTED_CARRIERS } from '../common';

export class CourierOfficeDeliveryBodyDto {
  @IsIn([DeliveryMethod.COURIER_OFFICE])
  method!: DeliveryMethod.COURIER_OFFICE;

  @IsIn(SUPPORTED_CARRIERS)
  carrier!: ShippingMethod;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  officeCode!: string;
}

export class CourierAddressDeliveryBodyDto {
  @IsIn([DeliveryMethod.COURIER_ADDRESS])
  method!: DeliveryMethod.COURIER_ADDRESS;

  @IsIn(SUPPORTED_CARRIERS)
  carrier!: ShippingMethod;

  @IsObject()
  @ValidateNested()
  @Type(() => DeliveryAddressBodyDto)
  address!: DeliveryAddressBodyDto;
}

export class StorePickupDeliveryBodyDto {
  @IsIn([DeliveryMethod.STORE_PICKUP])
  method!: DeliveryMethod.STORE_PICKUP;
}

export class PlaceOrderBodyDto implements PlaceOrderRequestDto {
  @IsUUID()
  cartId!: string;

  @IsInt()
  @Min(0)
  cartVersion!: number;

  @IsInt()
  @Min(0)
  expectedTotalCents!: number;

  @IsIn([PaymentMethod.CASH_ON_DELIVERY])
  paymentMethod!: PaymentMethod.CASH_ON_DELIVERY;

  @IsObject()
  @ValidateNested()
  @Type(() => Object, {
    keepDiscriminatorProperty: true,
    discriminator: {
      property: 'method',
      subTypes: [
        {
          value: CourierOfficeDeliveryBodyDto,
          name: DeliveryMethod.COURIER_OFFICE,
        },
        {
          value: CourierAddressDeliveryBodyDto,
          name: DeliveryMethod.COURIER_ADDRESS,
        },
        {
          value: StorePickupDeliveryBodyDto,
          name: DeliveryMethod.STORE_PICKUP,
        },
      ],
    },
  })
  delivery!:
    | CourierOfficeDeliveryBodyDto
    | CourierAddressDeliveryBodyDto
    | StorePickupDeliveryBodyDto;
}

export class OrderIdParamsDto {
  @IsUUID()
  orderId!: string;
}
