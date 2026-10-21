/**
 * The Turnstile widget's public site key. The fallback is Cloudflare's test key,
 * which passes every visitor and pairs only with the API's test secret.
 */
export const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA";
