import { z } from 'zod';
import { MAX_CART_LINE_QUANTITY } from '../dto/cart.dto';

/**
 * A brand id is a TecDoc `dataSupplierId`: digits, no leading zero. Kept strict
 * so the two halves of an article identity can never be swapped by accident.
 */
const brandIdSchema = z.string().regex(/^[1-9][0-9]*$/);

const articleNumberSchema = z.string().min(1).max(50);

const quantitySchema = z.number().int().min(1).max(MAX_CART_LINE_QUANTITY);

export const articleIdentitySchema = z.object({
  brandId: brandIdSchema,
  articleNumber: articleNumberSchema,
});

export const addCartLineSchema = articleIdentitySchema.extend({
  quantity: quantitySchema,
  brandName: z.string().min(1).max(200),
  brandLogoUrl: z.string().url().max(2048).nullable(),
  description: z.string().min(1).max(500),
  thumbnailUrl: z.string().url().max(2048).nullable(),
  /** The live inc-VAT price the customer was looking at, in cents. */
  addedAtPriceIncVat: z.number().int().nonnegative().nullable(),
});

/**
 * Both fields are optional so the quantity stepper and the order checkbox can
 * use one route, but a request that sets neither changes nothing and is
 * refused rather than silently bumping the cart version.
 */
export const updateCartLineSchema = z
  .object({
    quantity: quantitySchema.optional(),
    isSelected: z.boolean().optional(),
  })
  .refine(
    (value) => value.quantity !== undefined || value.isSelected !== undefined,
    { message: 'Nothing to update' },
  );

export const setCartSelectionSchema = z.object({
  isSelected: z.boolean(),
});

export type AddCartLineInput = z.infer<typeof addCartLineSchema>;
export type UpdateCartLineInput = z.infer<typeof updateCartLineSchema>;
export type SetCartSelectionInput = z.infer<typeof setCartSelectionSchema>;
