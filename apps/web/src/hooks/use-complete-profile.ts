"use client";

import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  completeProfileSchema,
  missingProfileDetails,
  type CustomerProfileDto,
  type ProfileDetail,
} from "@vp-parts-shop/shared";
import { customerProfileQueryOptions, updateCustomerProfile } from "@/lib/api/customers";
import { REGISTRATION_FIELD_MESSAGES } from "@/lib/auth/registration-values";

const SAVE_FAILED_MESSAGE = "Не успяхме да запазим данните. Опитайте отново.";

export interface ProfileFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  onBlur: () => void;
  error: string | undefined;
}

export interface CompleteProfile {
  /** What the profile lacks, in form order; the only fields asked for. */
  missing: ProfileDetail[];
  fieldProps: (detail: ProfileDetail) => ProfileFieldProps;
  /** What went wrong saving them, for the whole form. */
  failure: string | null;
  isSubmitting: boolean;
  submit: (event?: FormEvent) => Promise<void>;
}

/**
 * Collects the details a filed customer's profile lacks — a Google sign-in has
 * no phone and perhaps no last name — and saves them. Saving puts the complete
 * profile in its query, which is what moves checkout on. See docs/AUTH.md.
 */
export function useCompleteProfile(profile: CustomerProfileDto): CompleteProfile {
  const queryClient = useQueryClient();
  const missing = missingProfileDetails(profile);

  const [values, setValues] = useState<Partial<Record<ProfileDetail, string>>>({});
  const [touched, setTouched] = useState<ReadonlySet<ProfileDetail>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const validation = completeProfileSchema.safeParse(
    Object.fromEntries(missing.map((detail) => [detail, values[detail]?.trim() ?? ""])),
  );
  const invalid = new Set(validation.error?.issues.map((issue) => issue.path[0]));

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    setTouched(new Set(missing));

    if (!validation.success) return;

    setIsSubmitting(true);
    setFailure(null);

    try {
      const saved = await updateCustomerProfile(validation.data);
      queryClient.setQueryData(customerProfileQueryOptions.queryKey, saved);
    } catch {
      setFailure(SAVE_FAILED_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    missing,
    fieldProps: (detail) => ({
      value: values[detail] ?? "",
      onValueChange: (value) => {
        setValues((current) => ({ ...current, [detail]: value }));
        setFailure(null);
      },
      onBlur: () => setTouched((current) => new Set(current).add(detail)),
      error:
        touched.has(detail) && invalid.has(detail)
          ? REGISTRATION_FIELD_MESSAGES[detail]
          : undefined,
    }),
    failure,
    isSubmitting,
    submit,
  };
}
