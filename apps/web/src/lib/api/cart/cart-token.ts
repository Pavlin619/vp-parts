/**
 * Names the cart this browser owns while nobody is signed in.
 *
 * Kept in `localStorage` rather than a cookie because the shop and the API are
 * on different sites: a `SameSite=Lax` cookie would never be sent with the
 * API call, and `SameSite=None` is on its way out. The token names one cart
 * and grants nothing else, so it is not worth a cross-site cookie to hide it.
 */
const CART_TOKEN_KEY = "vp-cart-token";

/**
 * Reading storage throws outright in some browsers (Safari with site data
 * blocked), so every access is guarded. A visitor whose storage is unreadable
 * simply gets a fresh cart on each visit, which beats a page that will not
 * render.
 */
export function readCartToken(): string | null {
  try {
    return window.localStorage.getItem(CART_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function writeCartToken(token: string): void {
  try {
    window.localStorage.setItem(CART_TOKEN_KEY, token);
  } catch {
    // A cart that cannot be remembered still works for this page view.
  }
}

/** Called when a customer claims the cart: the device no longer owns one. */
export function clearCartToken(): void {
  try {
    window.localStorage.removeItem(CART_TOKEN_KEY);
  } catch {
    // Nothing to do — the next request simply carries a token the server
    // has already retired, and is answered with the account's cart.
  }
}
