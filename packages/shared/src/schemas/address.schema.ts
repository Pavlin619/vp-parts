import { z } from 'zod';
import { isLocatableAddress } from '../dto/delivery.dto';

export const addressSchema = z
  .object({
    fullName: z.string().min(1).max(100),
    /** The carrier's settlement id; `city` and `postcode` are kept for display. */
    placeId: z.string().min(1).max(20),
    city: z.string().min(1).max(100),
    postcode: z.string().regex(/^\d{4}$/, 'Must be exactly 4 digits'),
    street: z.string().max(200).optional(),
    streetNumber: z
      .string()
      .regex(/^[a-zA-Z0-9]{1,10}$/, 'Must be alphanumeric, 1–10 characters')
      .optional(),
    quarter: z.string().max(100).optional(),
    other: z.string().max(100).optional(),
    phoneNumber: z
      .string()
      .regex(/^(\+359|0)[0-9]{8,9}$/, 'Must be a valid Bulgarian phone number'),
    isDefault: z.boolean().optional().default(false),
  })
  .refine(isLocatableAddress, {
    message: 'Name a street and its number, or a quarter and where in it',
    path: ['street'],
  });

export type AddressInput = z.infer<typeof addressSchema>;
