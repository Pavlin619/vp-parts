import "server-only";
import { headers } from "next/headers";
import {
  FORWARDED_FOR_HEADER,
  WEB_ORIGIN_TOKEN_HEADER,
  type SearchResponseDto,
} from "@vp-parts-shop/shared";
import { apiFetch } from "./index";

/**
 * Kept out of `catalog.ts` because it is the one catalog read the browser never
 * makes itself. Being server-rendered it reaches the API as *us* rather than as
 * the visitor, so it needs request context — and therefore a secret and
 * `next/headers`, neither of which may follow it into a client bundle.
 */
export async function searchByPartNumber(
  query: string,
  vehicleId?: string,
): Promise<SearchResponseDto> {
  const params = new URLSearchParams({ q: query });

  if (vehicleId) {
    params.set("vehicleId", vehicleId);
  }

  return apiFetch<SearchResponseDto>(`/search?${params}`, {
    headers: await clientAttributionHeaders(),
  });
}

/**
 * Tells the API which visitor this call is for. Without it every server-side
 * search is attributed to a Vercel egress address and the whole site shares one
 * rate-limit allowance; the token is what makes the API believe the address
 * rather than treating it as a header anyone could have written. Both or
 * neither — an unvouched-for address is ignored downstream.
 *
 * Never call from a `'use cache'` function: `headers()` throws in a cache scope.
 */
async function clientAttributionHeaders(): Promise<Record<string, string>> {
  const token = process.env.WEB_ORIGIN_TOKEN;

  if (!token) {
    return {};
  }

  const forwardedFor = (await headers()).get(FORWARDED_FOR_HEADER);

  if (!forwardedFor) {
    return {};
  }

  return {
    [FORWARDED_FOR_HEADER]: forwardedFor,
    [WEB_ORIGIN_TOKEN_HEADER]: token,
  };
}
