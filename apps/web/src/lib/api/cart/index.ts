import { queryOptions } from "@tanstack/react-query";
import {
  CART_TOKEN_HEADER,
  EMPTY_CART,
  type AddCartLineInput,
  type ArticleIdentityDto,
  type CartAdoptResponseDto,
  type CartDto,
  type UpdateCartLineInput,
} from "@vp-parts-shop/shared";
import { apiFetch } from "../index";
import { readCartToken, writeCartToken } from "./cart-token";

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

interface CartFetchOptions {
  method?: string;
  body?: unknown;
}

/**
 * Every cart call carries the device's token and watches the response for a
 * new one. The server mints a cart on the first write, and the token it hands
 * back in that one response is the only chance to learn which cart is ours.
 */
async function cartFetch<T>(
  path: string,
  { method = "GET", body }: CartFetchOptions = {},
): Promise<T> {
  const token = readCartToken();

  return apiFetch<T>(path, {
    method,
    body,
    headers: token ? { [CART_TOKEN_HEADER]: token } : undefined,
    onHeaders: (headers) => {
      const minted = headers.get(CART_TOKEN_HEADER);
      if (minted) {
        writeCartToken(minted);
      }
    },
  });
}

function linePath({ brandId, articleNumber }: ArticleIdentityDto): string {
  return `/cart/items/${encodeURIComponent(brandId)}/${encodeURIComponent(articleNumber)}`;
}
