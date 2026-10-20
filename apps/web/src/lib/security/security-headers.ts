import type { ClerkMiddlewareOptions } from "@clerk/nextjs/server";

type ContentSecurityPolicyDirectives = NonNullable<
  NonNullable<ClerkMiddlewareOptions["contentSecurityPolicy"]>["directives"]
>;

interface ConnectOrigins {
  apiUrl: string;
  mapStyleUrl: string;
}

/** CSP host syntax, where `*.` matches a subdomain at any depth. */
export const REMOTE_IMAGE_HOSTS = [
  // TecDoc / TecAlliance CDN (article thumbnails)
  "*.tecalliance.net",
  "*.tecdoc.net",
  "*.tecalliance.services",
  // Placeholder brand logos, reachable only under TECDOC_MOCK=true. Real
  // getBrands logos are on digital-assets.tecalliance.services, covered
  // above; this goes when TecDocMockClient does.
  "placehold.co",
];

export const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), browsing-topics=()",
  },
  { key: "X-Frame-Options", value: "DENY" },
];

/** Merged by Clerk's middleware into the defaults it keeps for its own hosts. */
export function contentSecurityPolicyDirectives({
  apiUrl,
  mapStyleUrl,
}: ConnectOrigins): ContentSecurityPolicyDirectives {
  return {
    "connect-src": [new URL(apiUrl).origin, new URL(mapStyleUrl).origin],
    "img-src": ["data:", "blob:", ...REMOTE_IMAGE_HOSTS.map((host) => `https://${host}`)],
    "object-src": ["none"],
    "base-uri": ["self"],
    "frame-ancestors": ["none"],
  };
}

/** next/image's `*` matches one subdomain level, so the CSP wildcard becomes `**`. */
export function imageRemotePatterns() {
  return REMOTE_IMAGE_HOSTS.map((host) => ({
    protocol: "https" as const,
    hostname: host.replace(/^\*\./, "**."),
  }));
}
