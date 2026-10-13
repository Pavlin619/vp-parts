import { Transform } from 'class-transformer';
import {
  Validate,
  ValidateIf,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  bulgarianMobileSchema,
  CompleteProfileInput,
  personNameSchema,
} from '@vp-parts-shop/shared';

interface FieldSchema {
  safeParse(value: unknown): { success: boolean };
}

/** Defers to the shared field schema, so the API accepts exactly what the form does. */
@ValidatorConstraint({ name: 'satisfiesSchema', async: false })
class SatisfiesSchema implements ValidatorConstraintInterface {
  validate(value: unknown, { constraints }: ValidationArguments): boolean {
    const [schema] = constraints as [FieldSchema];

    return schema.safeParse(value).success;
  }

  defaultMessage({ property }: ValidationArguments): string {
    return `${property} is not valid`;
  }
}

const isGiven = (_body: object, value: unknown) => value !== undefined;

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** E.164 for a valid phone; anything else is left for the validator to refuse. */
const asMobile = ({ value }: { value: unknown }) => {
  const parsed = bulgarianMobileSchema.safeParse(value);

  return parsed.success ? parsed.data : value;
};

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
