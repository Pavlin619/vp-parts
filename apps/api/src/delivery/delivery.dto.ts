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
  DELIVERY_ADDRESS_LIMITS,
  DeliveryAddressDto,
  DeliveryDestinationType,
  DeliveryQuoteRequestDto,
  isLocatableAddress,
  ShippingMethod,
} from '@vp-parts-shop/shared';

/** Must name only carriers registered under DELIVERY_CARRIERS in DeliveryModule. */
const SUPPORTED_CARRIERS = [ShippingMethod.ECONT];

const LIMITS = DELIVERY_ADDRESS_LIMITS;

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
  @MaxLength(LIMITS.street)
  street?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.streetNumber)
  streetNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.quarter)
  quarter?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.block)
  block?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.entrance)
  entrance?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.floor)
  floor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.apartment)
  apartment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.note)
  note?: string;
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
