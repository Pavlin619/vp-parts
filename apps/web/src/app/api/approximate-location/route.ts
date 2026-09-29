import { approximateLocationOf } from "@/lib/checkout/delivery/approximate-location";

/** The API runs off Vercel and never sees its geo headers, so the site answers this itself. */
export function GET(request: Request) {
  return Response.json(approximateLocationOf(request.headers), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
