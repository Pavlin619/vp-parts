import { clerkMiddleware } from "@clerk/nextjs/server";
import { BROWSER_API_URL } from "@/lib/api/browser-api-url";
import { MAP_STYLE_URL } from "@/lib/checkout/delivery/map-style";
import { contentSecurityPolicyDirectives } from "@/lib/security/security-headers";

export default clerkMiddleware({
  contentSecurityPolicy: {
    directives: contentSecurityPolicyDirectives({
      apiUrl: BROWSER_API_URL,
      mapStyleUrl: MAP_STYLE_URL,
    }),
  },
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
