import { z } from 'zod';
import { bulgarianMobileSchema, personNameSchema } from './customers.schema';

export const contactEmailSchema = z.string().email().max(254);

export const quickOrderContactSchema = z.object({
  firstName: personNameSchema,
  lastName: personNameSchema,
  phoneNumber: bulgarianMobileSchema,
  email: contactEmailSchema.optional(),
});

export type QuickOrderContactInput = z.infer<typeof quickOrderContactSchema>;
