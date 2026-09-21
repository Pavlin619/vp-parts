import { PartialType, PickType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { MAX_CART_LINE_QUANTITY } from '@vp-parts-shop/shared';

/** Skips the rest of a field's validation when the caller sent an explicit null. */
const IsNullable = () => ValidateIf((_, value) => value !== null);

export class ArticleIdentityParamsDto {
  @IsString()
  @Matches(/^[1-9][0-9]*$/)
  brandId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  articleNumber!: string;
}

export class AddCartLineDto extends ArticleIdentityParamsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_CART_LINE_QUANTITY)
  quantity!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  brandName!: string;

  @IsNullable()
  @IsUrl()
  @MaxLength(2048)
  brandLogoUrl!: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description!: string;

  @IsNullable()
  @IsUrl()
  @MaxLength(2048)
  thumbnailUrl!: string | null;

  /**
   * The live inc-VAT price, in cents, the customer was looking at when they
   * added the line. Nullable because an add can happen while the availability
   * read is failing, or for a part we hold no offer for.
   */
  @IsNullable()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  addedAtPriceIncVat!: number | null;
}

/**
 * The quantity stepper and the order checkbox share this route. A request that
 * sets neither field is refused rather than bumping the cart version for
 * nothing — see the service.
 */
export class UpdateCartLineDto extends PartialType(
  PickType(AddCartLineDto, ['quantity'] as const),
) {
  @IsOptional()
  @IsBoolean()
  isSelected?: boolean;
}

export class SetCartSelectionDto {
  @IsBoolean()
  isSelected!: boolean;
}
