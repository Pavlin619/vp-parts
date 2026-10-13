const HOME = "/";

/**
 * Where to go after signing up, kept on this site: `redirect_url` arrives in
 * the query string, so anyone can link here with someone else's site in it.
 */
export function sameOriginPath(target: string | undefined, origin: string): string {
  if (!target) {
    return HOME;
  }

  try {
    const url = new URL(target, origin);
    const isProtocolRelative = url.pathname.startsWith("//");

    return url.origin === origin && !isProtocolRelative
      ? `${url.pathname}${url.search}${url.hash}`
      : HOME;
  } catch {
    return HOME;
  }
}

export function withRedirectUrl(path: string, redirectUrl: string | undefined): string {
  return redirectUrl ? `${path}?redirect_url=${encodeURIComponent(redirectUrl)}` : path;
}
