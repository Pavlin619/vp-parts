import { queryOptions } from "@tanstack/react-query";
import type { CustomerProfileDto } from "@vp-parts-shop/shared";
import { apiFetch } from "./index";

export const customerProfileQueryOptions = queryOptions({
  queryKey: ["customers", "me"] as const,
  queryFn: getCustomerProfile,
  retry: false,
});

export function getCustomerProfile(): Promise<CustomerProfileDto> {
  return apiFetch("/customers/me", { withSession: true });
}

/**
 * Files the signed-in Clerk user as a customer, from what the registration form
 * stored on them. Safe to repeat: someone already filed is returned as they are.
 */
export function fileCustomer(): Promise<CustomerProfileDto> {
  return apiFetch("/customers/me", { method: "POST", withSession: true });
}
