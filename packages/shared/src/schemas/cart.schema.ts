import { z } from 'zod';

export const addCartItemSchema = z.object({
  articleNumber: z.string().min(1),
  quantity: z.number().int().positive(),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().positive(),
});

export const saveCartSchema = z.object({
  name: z.string().min(1).max(200),
});

export type AddCartItemInput = z.infer<typeof addCartItemSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
export type SaveCartInput = z.infer<typeof saveCartSchema>;
