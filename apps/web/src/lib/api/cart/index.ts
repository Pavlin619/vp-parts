import { queryOptions } from "@tanstack/react-query";
import {
  EMPTY_CART,
  type AddCartLineInput,
  type ArticleIdentityDto,
  type CartAdoptResponseDto,
  type CartDto,
  type UpdateCartLineInput,
} from "@vp-parts-shop/shared";
import { cartFetch } from "./cart-fetch";
import { getSessionToken } from "../session-token";
import { readCartToken } from "./cart-token";

export { clearCartToken, readCartToken } from "./cart-token";

export const cartQueryOptions = queryOptions({
  queryKey: ["cart"] as const,
  queryFn: getCart,
  staleTime: 30_000,
  // Writes answer into the mirror, never into this cache, so an answer equal to
  // the cached one can still be news to the mirror: it needs a new reference
  // for `useCartSync` to adopt it.
  structuralSharing: false,
});

export async function getCart(): Promise<CartDto> {
  // A guest with no token has no cart, and asking for one is a round trip
  // whose answer we already know.
  if (!(await hasCartToRead())) {
    return EMPTY_CART;
  }

  return cartFetch("/cart");
}

/**
 * Whether the server could name a cart for this visitor: a guest's by the
 * device's token, a customer's by their account.
 */
export async function hasCartToRead(): Promise<boolean> {
  return readCartToken() !== null || (await getSessionToken()) !== null;
}

export function addCartLine(line: AddCartLineInput): Promise<CartDto> {
  return cartFetch("/cart/items", { method: "POST", body: line });
}

export function updateCartLine(
  article: ArticleIdentityDto,
  patch: UpdateCartLineInput,
): Promise<CartDto> {
  return cartFetch(linePath(article), { method: "PATCH", body: patch });
}

export function removeCartLine(article: ArticleIdentityDto): Promise<CartDto> {
  return cartFetch(linePath(article), { method: "DELETE" });
}

export function setCartSelection(isSelected: boolean): Promise<CartDto> {
  return cartFetch("/cart/selection", {
    method: "POST",
    body: { isSelected },
  });
}

export function clearCart(): Promise<CartDto> {
  return cartFetch("/cart", { method: "DELETE" });
}

/**
 * Unites the cart this device filled anonymously with the one the account
 * already held. Called once, at sign-in.
 */
export function adoptCart(): Promise<CartAdoptResponseDto> {
  return cartFetch("/cart/adopt", { method: "POST" });
}

function linePath({ brandId, articleNumber }: ArticleIdentityDto): string {
  return `/cart/items/${encodeURIComponent(brandId)}/${encodeURIComponent(articleNumber)}`;
}
