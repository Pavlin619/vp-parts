import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  CreateCustomerRequestDto,
  CustomerAddressInputDto,
  isBulgarianMobile,
  ShippingMethod,
  toBulgarianMobile,
} from '@vp-parts-shop/shared';
import { DeliveryAddressBodyDto, SUPPORTED_CARRIERS } from '../common';

@ValidatorConstraint({ name: 'isBulgarianMobile', async: false })
class BulgarianMobileConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isBulgarianMobile(value);
  }

  defaultMessage(): string {
    return 'Must be a Bulgarian mobile number';
  }
}

export class CustomerAddressBodyDto
  extends DeliveryAddressBodyDto
  implements CustomerAddressInputDto
{
  @IsIn(SUPPORTED_CARRIERS)
  carrier!: ShippingMethod;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city!: string;

  @Matches(/^\d{4}$/)
  postCode!: string;
}

export class CreateCustomerBodyDto implements CreateCustomerRequestDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? (toBulgarianMobile(value) ?? value) : value,
  )
  @Validate(BulgarianMobileConstraint)
  phoneNumber!: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CustomerAddressBodyDto)
  address?: CustomerAddressBodyDto;
}
