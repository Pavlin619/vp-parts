import { z } from 'zod';
import { DELIVERY_ADDRESS_LIMITS, isLocatableAddress } from '../dto/delivery.dto';
import { ShippingMethod } from '../enums';

const LIMITS = DELIVERY_ADDRESS_LIMITS;

export const customerAddressSchema = z
  .object({
    carrier: z.enum(ShippingMethod),
    placeId: z.string().regex(/^\d{1,10}$/),
    city: z.string().min(1).max(100),
    postCode: z.string().regex(/^\d{4}$/, 'Must be exactly 4 digits'),
    street: z.string().max(LIMITS.street).optional(),
    streetNumber: z.string().max(LIMITS.streetNumber).optional(),
    quarter: z.string().max(LIMITS.quarter).optional(),
    block: z.string().max(LIMITS.block).optional(),
    entrance: z.string().max(LIMITS.entrance).optional(),
    floor: z.string().max(LIMITS.floor).optional(),
    apartment: z.string().max(LIMITS.apartment).optional(),
    note: z.string().max(LIMITS.note).optional(),
  })
  .refine(isLocatableAddress, {
    message: 'Name a street and its number, or a quarter and where in it',
    path: ['street'],
  });

export type CustomerAddressInput = z.infer<typeof customerAddressSchema>;
