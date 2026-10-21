import { Transform } from 'class-transformer';
import { Validate, ValidateIf } from 'class-validator';
import {
  bulgarianMobileSchema,
  CompleteProfileInput,
  personNameSchema,
} from '@vp-parts-shop/shared';
import { asMobile, isGiven, SatisfiesSchema, trimmed } from '../common';

export class CompleteProfileBodyDto implements CompleteProfileInput {
  @ValidateIf(isGiven)
  @Transform(trimmed)
  @Validate(SatisfiesSchema, [personNameSchema])
  firstName?: string;

  @ValidateIf(isGiven)
  @Transform(trimmed)
  @Validate(SatisfiesSchema, [personNameSchema])
  lastName?: string;

  @ValidateIf(isGiven)
  @Transform(asMobile)
  @Validate(SatisfiesSchema, [bulgarianMobileSchema])
  phoneNumber?: string;
}
