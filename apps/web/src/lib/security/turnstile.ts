/**
 * The Turnstile widget's public site key. The fallback is Cloudflare's invisible
 * test key, which passes every visitor unseen and pairs only with the API's test
 * secret; the visible one marks itself "for testing only".
 */
export const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "1x00000000000000000000BB";
