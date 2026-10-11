"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useClerk, useSignUp } from "@clerk/nextjs";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  ShippingMethod,
  type RegisterCustomerInput,
  type RegistrationMetadata,
} from "@vp-parts-shop/shared";
import { Button } from "@/components/ui/button";
import { PRIMARY_ACTION_CLASS } from "@/components/checkout/delivery/address/address-action-buttons";
import { AddressField } from "@/components/checkout/delivery/address/address-field";
import { addressErrors } from "@/components/checkout/delivery/address/address-errors";
import {
  EMPTY_ADDRESS_FORM,
  toCustomerAddress,
  type AddressFormValues,
  type LocatorMode,
} from "@/components/checkout/delivery/address/address-form-values";
import { customerProfileQueryOptions, fileCustomer } from "@/lib/api/customers";
import {
  describeSignUpError,
  SIGN_UP_FAILED_MESSAGE,
  type RegistrationField,
  type SignUpErrorMessage,
} from "@/lib/auth/clerk-errors";
import {
  EMPTY_REGISTRATION,
  validateRegistration,
  type RegistrationValues,
} from "@/lib/auth/registration-values";
import { focusFirstInvalidField } from "@/lib/focus-first-invalid-field";
import { cn } from "@/lib/utils";
import { PhoneField } from "./phone-field";
import { RegistrationAddressSection } from "./registration-address-section";

const DEFAULT_ADDRESS_CARRIER = ShippingMethod.ECONT;

interface RegistrationFormProps {
  /** Called once the account is signed in; the session sync merges the cart on its own. */
  onComplete?: () => void;
  /** Called before Clerk is asked; the session can go live before `onComplete`. */
  onSignUpStart?: () => void;
  className?: string;
}

interface SignUpDependencies {
  signUp: ReturnType<typeof useSignUp>["signUp"];
  clerk: ReturnType<typeof useClerk>;
  queryClient: QueryClient;
}

/**
 * Our own sign-up: Clerk's `<SignUp/>` cannot take the phone and address the
 * API files the customer with. See docs/AUTH.md.
 */
export function RegistrationForm({
  onComplete,
  onSignUpStart,
  className,
}: RegistrationFormProps) {
  const { signUp } = useSignUp();
  const clerk = useClerk();
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);

  const [values, setValues] = useState<RegistrationValues>(EMPTY_REGISTRATION);
  const [touched, setTouched] = useState<ReadonlySet<RegistrationField>>(new Set());
  const [submitAttempts, setSubmitAttempts] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [failure, setFailure] = useState<SignUpErrorMessage | null>(null);
  const [isAddressOpen, setIsAddressOpen] = useState(false);
  const [address, setAddress] = useState<AddressFormValues>(EMPTY_ADDRESS_FORM);
  const [addressMode, setAddressMode] = useState<LocatorMode>("street");

  const validation = validateRegistration(values);
  const fieldErrors = validation.success ? {} : validation.errors;

  useEffect(() => {
    if (submitAttempts > 0 || failure?.field) {
      focusFirstInvalidField(formRef.current);
    }
  }, [submitAttempts, failure]);

  const errorOf = (field: RegistrationField) => {
    if (failure?.field === field) return failure.message;

    return submitAttempts > 0 || touched.has(field) ? fieldErrors[field] : undefined;
  };

  const fieldProps = (field: RegistrationField) => ({
    value: values[field],
    onValueChange: (value: string) => {
      setValues((current) => ({ ...current, [field]: value }));
      setFailure(null);
    },
    onBlur: () => setTouched((current) => new Set(current).add(field)),
    error: errorOf(field),
  });

  const readRegistration = (): RegisterCustomerInput | null => {
    if (isAddressOpen && Object.keys(addressErrors(address, addressMode)).length > 0) {
      return null;
    }

    const result = validateRegistration(
      values,
      isAddressOpen ? toCustomerAddress(address, DEFAULT_ADDRESS_CARRIER) : undefined,
    );

    return result.success ? result.data : null;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitAttempts((attempts) => attempts + 1);

    const registration = readRegistration();
    if (!registration) return;

    setIsSubmitting(true);
    setFailure(null);
    onSignUpStart?.();
    const refusal = await signUpCustomer({ signUp, clerk, queryClient }, registration);
    setIsSubmitting(false);

    if (refusal) {
      setFailure(refusal);
      return;
    }

    onComplete?.();
  };

  return (
    <form
      ref={formRef}
      aria-label="Регистрация"
      noValidate
      onSubmit={submit}
      className={cn("flex flex-col gap-3", className)}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <AddressField label="Име" autoComplete="given-name" {...fieldProps("firstName")} />
        <AddressField label="Фамилия" autoComplete="family-name" {...fieldProps("lastName")} />
      </div>
      <AddressField label="Имейл" type="email" autoComplete="email" {...fieldProps("email")} />
      <AddressField
        label="Парола"
        type="password"
        autoComplete="new-password"
        {...fieldProps("password")}
      />
      <PhoneField {...fieldProps("phoneNumber")} />

      <RegistrationAddressSection
        carrier={DEFAULT_ADDRESS_CARRIER}
        isOpen={isAddressOpen}
        onOpenChange={setIsAddressOpen}
        values={address}
        onValuesChange={setAddress}
        mode={addressMode}
        onModeChange={setAddressMode}
        showAllErrors={submitAttempts > 0}
      />

      <div id="clerk-captcha" />

      {failure && !failure.field && (
        <p role="alert" className="text-[12.5px] text-danger">
          {failure.message}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting} className={PRIMARY_ACTION_CLASS}>
        {isSubmitting ? "Създаваме профила…" : "Създай профил"}
      </Button>
    </form>
  );
}

/** Signs up with Clerk and files the customer; returns what went wrong, or null. */
async function signUpCustomer(
  { signUp, clerk, queryClient }: SignUpDependencies,
  { email, password, firstName, lastName, phoneNumber, address }: RegisterCustomerInput,
): Promise<SignUpErrorMessage | null> {
  const unsafeMetadata: RegistrationMetadata = { phoneNumber, ...(address && { address }) };
  const { error } = await signUp.password({
    emailAddress: email,
    password,
    firstName,
    lastName,
    unsafeMetadata,
  });

  if (error) {
    return describeSignUpError(error);
  }

  if (signUp.status !== "complete") {
    console.error("Clerk left the sign-up incomplete", signUp.status);
    return { field: null, message: SIGN_UP_FAILED_MESSAGE };
  }

  const finalized = await signUp.finalize();

  if (finalized.error) {
    return describeSignUpError(finalized.error);
  }

  await fileSignedUpCustomer(clerk, queryClient);

  return null;
}

/**
 * The account exists by now, so a failure here is not the customer's: the
 * session sync files them on its next pass, and Clerk's webhook regardless.
 */
async function fileSignedUpCustomer(
  clerk: ReturnType<typeof useClerk>,
  queryClient: QueryClient,
): Promise<void> {
  try {
    const token = (await clerk.session?.getToken()) ?? undefined;
    queryClient.setQueryData(customerProfileQueryOptions.queryKey, await fileCustomer(token));
  } catch (error) {
    console.error("Filing the new customer failed; the session sync will retry", error);
  }
}
