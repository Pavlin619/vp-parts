import { z } from 'zod';
import { DELIVERY_ADDRESS_LIMITS, isLocatableAddress } from '../dto/delivery.dto';

const LIMITS = DELIVERY_ADDRESS_LIMITS;

export const addressSchema = z
  .object({
    fullName: z.string().min(1).max(100),
    /** The carrier's settlement id; `city` and `postcode` are kept for display. */
    placeId: z.string().min(1).max(20),
    city: z.string().min(1).max(100),
    postcode: z.string().regex(/^\d{4}$/, 'Must be exactly 4 digits'),
    street: z.string().max(LIMITS.street).optional(),
    streetNumber: z
      .string()
      .regex(/^[a-zA-Z0-9]{1,10}$/, 'Must be alphanumeric, 1–10 characters')
      .optional(),
    quarter: z.string().max(LIMITS.quarter).optional(),
    block: z.string().max(LIMITS.block).optional(),
    entrance: z.string().max(LIMITS.entrance).optional(),
    floor: z.string().max(LIMITS.floor).optional(),
    apartment: z.string().max(LIMITS.apartment).optional(),
    note: z.string().max(LIMITS.note).optional(),
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
