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
import { readCartToken } from "./cart-token";

export { clearCartToken, readCartToken } from "./cart-token";

export const cartQueryOptions = queryOptions({
  queryKey: ["cart"] as const,
  queryFn: getCart,
  // A cart must reflect the last thing the customer clicked, including on
  // another device — but every mutation already writes the server's answer
  // straight into this cache, so a refetch is only ever a reconciliation.
  staleTime: 30_000,
});

export function getCart(): Promise<CartDto> {
  // A visitor with no token has no cart, and asking for one is a round trip
  // whose answer we already know.
  if (!readCartToken()) {
    return Promise.resolve(EMPTY_CART);
  }

  return cartFetch("/cart");
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
