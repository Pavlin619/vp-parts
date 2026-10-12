"use client";

import { useState, type FormEvent } from "react";
import { useUser } from "@clerk/nextjs";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  registrationMetadataSchema,
  type RegistrationMetadata,
} from "@vp-parts-shop/shared";
import {
  customerProfileQueryOptions,
  fileCustomer,
  isCustomerUnfileable,
} from "@/lib/api/customers";
import { isClerkRateLimited, TOO_MANY_REQUESTS_MESSAGE } from "@/lib/auth/clerk-errors";

type ClerkUser = NonNullable<ReturnType<typeof useUser>["user"]>;

const PHONE_INVALID_MESSAGE = "Въведете валиден мобилен номер";
const SAVE_FAILED_MESSAGE = "Не успяхме да запазим телефона. Опитайте отново.";

export interface CompleteProfile {
  phoneNumber: string;
  changePhoneNumber: (value: string) => void;
  markTouched: () => void;
  phoneError: string | undefined;
  /** What went wrong saving it, for the whole form. */
  failure: string | null;
  isSubmitting: boolean;
  submit: (event?: FormEvent) => Promise<void>;
}

/**
 * Collects the phone a signed-in customer Clerk holds none for — someone who
 * came through Google or Facebook — and files them with it. See docs/AUTH.md.
 *
 * `onComplete` runs once they are filed, or can never be, so the session sync
 * carries on and reports which.
 */
export function useCompleteProfile(onComplete: () => void): CompleteProfile {
  const { user } = useUser();
  const queryClient = useQueryClient();

  const [phoneNumber, setPhoneNumber] = useState("");
  const [isTouched, setIsTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const validation = registrationMetadataSchema.safeParse({ phoneNumber });

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    setIsTouched(true);

    if (!validation.success || !user) return;

    setIsSubmitting(true);
    setFailure(null);
    const refusal =
      (await storePhone(user, validation.data)) ?? (await fileCustomerWithPhone(queryClient));
    setIsSubmitting(false);

    if (refusal) {
      setFailure(refusal);
      return;
    }

    onComplete();
  };

  return {
    phoneNumber,
    changePhoneNumber: (value) => {
      setPhoneNumber(value);
      setFailure(null);
    },
    markTouched: () => setIsTouched(true),
    phoneError: isTouched && !validation.success ? PHONE_INVALID_MESSAGE : undefined,
    failure,
    isSubmitting,
    submit,
  };
}

/** Stores the phone where the API reads it; returns what went wrong, or null. */
async function storePhone(
  user: ClerkUser,
  unsafeMetadata: RegistrationMetadata,
): Promise<string | null> {
  try {
    await user.updateMetadata({ unsafeMetadata });
    return null;
  } catch (error) {
    return isClerkRateLimited(error) ? TOO_MANY_REQUESTS_MESSAGE : SAVE_FAILED_MESSAGE;
  }
}

/** Files the customer from the phone just stored; returns what went wrong, or null. */
async function fileCustomerWithPhone(queryClient: QueryClient): Promise<string | null> {
  try {
    queryClient.setQueryData(customerProfileQueryOptions.queryKey, await fileCustomer());
    return null;
  } catch (error) {
    // The session sync reports an account no retry can file; anything else is worth retrying here.
    return isCustomerUnfileable(error) ? null : SAVE_FAILED_MESSAGE;
  }
}
