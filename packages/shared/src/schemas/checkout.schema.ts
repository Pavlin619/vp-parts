import { z } from 'zod';
import { ShippingMethod, PaymentMethod } from '../enums';

export const confirmCheckoutSchema = z.object({
  cartId: z.string().uuid(),
});

export const createOrderSchema = z.object({
  cartId: z.string().uuid(),
  addressId: z.string().uuid(),
  shippingMethod: z.nativeEnum(ShippingMethod),
  paymentMethod: z.nativeEnum(PaymentMethod),
  paymentReference: z.string().optional(),
  vehicleTag: z.string().max(20).optional(),
  jobReference: z.string().max(200).optional(),
});

export const initiateMyPosSchema = z.object({
  cartId: z.string().uuid(),
  confirmedTotal: z.number().int().positive(),
});

export const confirmCodOrderSchema = z.object({
  cartId: z.string().uuid(),
  addressId: z.string().uuid(),
  shippingMethod: z.nativeEnum(ShippingMethod),
});

export type ConfirmCheckoutInput = z.infer<typeof confirmCheckoutSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type InitiateMyPosInput = z.infer<typeof initiateMyPosSchema>;
export type ConfirmCodOrderInput = z.infer<typeof confirmCodOrderSchema>;
