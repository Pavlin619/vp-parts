import { z } from 'zod';
import { toBulgarianMobile } from '../phone';
import { customerAddressSchema } from './address.schema';

/** A business line may be a landline, so this is looser than a customer's mobile. */
const bulgarianPhoneSchema = z
  .string()
  .regex(/^(\+359|0)[0-9]{8,9}$/, 'Must be a valid Bulgarian phone number');

/** Normalises to E.164, so what is validated is exactly what is stored. */
export const bulgarianMobileSchema = z.string().transform((value, context) => {
  const mobile = toBulgarianMobile(value);

  if (!mobile) {
    context.addIssue({ code: 'custom', message: 'Must be a Bulgarian mobile number' });

    return z.NEVER;
  }

  return mobile;
});

export const registerCustomerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1).max(100).regex(/^[^\d]+$/, 'No digits allowed'),
  lastName: z.string().min(1).max(100).regex(/^[^\d]+$/, 'No digits allowed'),
  phoneNumber: bulgarianMobileSchema,
  address: customerAddressSchema.optional(),
});

export const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).regex(/^[^\d]+$/, 'No digits allowed').optional(),
  lastName: z.string().min(1).max(100).regex(/^[^\d]+$/, 'No digits allowed').optional(),
  phoneNumber: bulgarianMobileSchema.optional(),
});

export const mechanicApplicationSchema = z.object({
  businessName: z.string().min(1).max(200),
  eik: z.string().regex(/^\d{9}(\d{4})?$/, 'Must be 9 or 13 digits'),
  vatNumber: z
    .string()
    .regex(/^BG\d{9}(\d{4})?$/, 'Must be BG followed by 9 or 13 digits')
    .optional(),
  businessAddress: z.string().min(1).max(500),
  businessPhone: bulgarianPhoneSchema,
});

export const saveVehicleSchema = z.object({
  tecdocVehicleId: z.string().min(1),
  manufacturer: z.string().min(1).max(100),
  modelSeries: z.string().min(1).max(100),
  variant: z.string().min(1).max(200),
});

export type RegisterCustomerInput = z.infer<typeof registerCustomerSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type MechanicApplicationInput = z.infer<typeof mechanicApplicationSchema>;
export type SaveVehicleInput = z.infer<typeof saveVehicleSchema>;
