import { z } from 'zod';

export const addressSchema = z.object({
  fullName: z.string().min(1).max(100),
  city: z.string().min(1).max(100),
  postcode: z.string().regex(/^\d{4}$/, 'Must be exactly 4 digits'),
  street: z.string().min(1).max(200),
  streetNumber: z.string().regex(/^[a-zA-Z0-9]{1,10}$/, 'Must be alphanumeric, 1–10 characters'),
  apartment: z.string().max(50).optional(),
  phoneNumber: z
    .string()
    .regex(/^(\+359|0)[0-9]{8,9}$/, 'Must be a valid Bulgarian phone number'),
  isDefault: z.boolean().optional().default(false),
});

export type AddressInput = z.infer<typeof addressSchema>;
