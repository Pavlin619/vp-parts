import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  DeliveryAddressDto,
  DeliveryDestinationType,
  DeliveryQuoteRequestDto,
  isLocatableAddress,
  ShippingMethod,
} from '@vp-parts-shop/shared';

/** Must name only carriers registered under DELIVERY_CARRIERS in DeliveryModule. */
const SUPPORTED_CARRIERS = [ShippingMethod.ECONT];

const PLACE_ID_PATTERN = /^\d{1,10}$/;

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

@ValidatorConstraint({ name: 'isLocatableAddress', async: false })
class LocatableAddressConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, { object }: ValidationArguments): boolean {
    return isLocatableAddress(object);
  }

  defaultMessage(): string {
    return 'Name a street and its number, or a quarter and where in it';
  }
}

export class DeliveryAddressBodyDto implements DeliveryAddressDto {
  @Matches(PLACE_ID_PATTERN)
  @Validate(LocatableAddressConstraint)
  placeId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  street?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  streetNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  quarter?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  other?: string;
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
}
