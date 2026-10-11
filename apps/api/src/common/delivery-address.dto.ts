import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  DELIVERY_ADDRESS_LIMITS,
  DeliveryAddressDto,
  isLocatableAddress,
  ShippingMethod,
} from '@vp-parts-shop/shared';

/** Must name only carriers registered under DELIVERY_CARRIERS in DeliveryModule. */
export const SUPPORTED_CARRIERS = [ShippingMethod.ECONT];

export const PLACE_ID_PATTERN = /^\d{1,10}$/;

const LIMITS = DELIVERY_ADDRESS_LIMITS;

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
