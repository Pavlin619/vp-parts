import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { bulgarianMobileSchema } from '@vp-parts-shop/shared';

interface FieldSchema {
  safeParse(value: unknown): { success: boolean };
}

/** Defers to the shared field schema, so the API accepts exactly what the form does. */
@ValidatorConstraint({ name: 'satisfiesSchema', async: false })
export class SatisfiesSchema implements ValidatorConstraintInterface {
  validate(value: unknown, { constraints }: ValidationArguments): boolean {
    const [schema] = constraints as [FieldSchema];

    return schema.safeParse(value).success;
  }

  defaultMessage({ property }: ValidationArguments): string {
    return `${property} is not valid`;
  }
}

export const isGiven = (_body: object, value: unknown) => value !== undefined;

export const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** E.164 for a valid phone; anything else is left for the validator to refuse. */
export const asMobile = ({ value }: { value: unknown }) => {
  const parsed = bulgarianMobileSchema.safeParse(value);

  return parsed.success ? parsed.data : value;
};
