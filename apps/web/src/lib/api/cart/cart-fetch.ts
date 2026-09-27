import { CART_TOKEN_HEADER } from "@vp-parts-shop/shared";
import { apiFetch } from "../index";
import { readCartToken, writeCartToken } from "./cart-token";

interface CartFetchOptions {
  method?: string;
  body?: unknown;
}

/**
 * Every cart call carries the device's token and watches the response for a
 * new one. The server mints a cart on the first write, and the token it hands
 * back in that one response is the only chance to learn which cart is ours.
 */
export async function cartFetch<T>(
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
