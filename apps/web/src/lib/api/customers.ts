import { queryOptions } from "@tanstack/react-query";
import { AppErrorCode, type CustomerProfileDto } from "@vp-parts-shop/shared";
import { ApiError, apiFetch } from "./index";

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
 * Pass `token` when the session was activated a moment ago and may not be
 * bridged to the API client yet.
 */
export function fileCustomer(token?: string): Promise<CustomerProfileDto> {
  return apiFetch("/customers/me", { method: "POST", token, withSession: !token });
}

/** A signed-in Clerk user the API has not filed as a customer yet. */
export function isCustomerNotFiled(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.errorCode === AppErrorCode.CUSTOMER_PROFILE_INCOMPLETE
  );
}

/** A signed-in Clerk user, usually from Google or Facebook, who has not given a phone yet. */
export function isPhoneRequired(error: unknown): boolean {
  return (
    error instanceof ApiError && error.errorCode === AppErrorCode.CUSTOMER_PHONE_REQUIRED
  );
}

/**
 * A filing no retry can fix: Clerk holds no email or names for the user, or
 * their email already belongs to another customer.
 */
export function isCustomerUnfileable(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.errorCode === AppErrorCode.VALIDATION_ERROR ||
      error.errorCode === AppErrorCode.EMAIL_ALREADY_EXISTS)
  );
}
