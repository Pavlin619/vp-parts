"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useClerk, useSignUp } from "@clerk/nextjs";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { RegisterCustomerInput, RegistrationMetadata } from "@vp-parts-shop/shared";
import { Button } from "@/components/ui/button";
import { PRIMARY_ACTION_CLASS } from "@/components/checkout/delivery/address/address-action-buttons";
import { TextField } from "@/components/common/text-field";
import { customerProfileQueryOptions, fileCustomer } from "@/lib/api/customers";
import {
  describeEmailCodeError,
  describeSignUpError,
  EMAIL_CODE_FAILED_MESSAGE,
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
import { EmailCodeStep } from "./email-code-step";
import { GoogleSignUpButton } from "./google-sign-up-button";
import { PhoneField } from "./phone-field";

interface RegistrationFormProps {
  /** Where signing up with Google comes back to, as `redirect_url` carried it. */
  redirectUrl?: string;
  /** Called once the account is signed in; the session sync merges the cart on its own. */
  onComplete?: () => void;
  /** Called before Clerk is asked; the session can go live before `onComplete`. */
  onSignUpStart?: () => void;
  className?: string;
}

type SignUp = ReturnType<typeof useSignUp>["signUp"];

interface SignUpDependencies {
  signUp: SignUp;
  clerk: ReturnType<typeof useClerk>;
  queryClient: QueryClient;
}

type SignUpStart = SignUpErrorMessage | "needs-email-code" | "complete";

/**
 * Our own sign-up: Clerk's `<SignUp/>` cannot take the phone the API files the
 * customer with. See docs/AUTH.md.
 */
export function RegistrationForm({
  redirectUrl,
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
  const [isAwaitingEmailCode, setIsAwaitingEmailCode] = useState(false);
  const dependencies = { signUp, clerk, queryClient };

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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitAttempts((attempts) => attempts + 1);

    if (!validation.success) return;
    const registration = validation.data;

    setIsSubmitting(true);
    setFailure(null);
    onSignUpStart?.();
    const start = await startSignUp(signUp, registration);

    if (start === "needs-email-code") {
      setIsSubmitting(false);
      setIsAwaitingEmailCode(true);
      return;
    }

    const refusal = start === "complete" ? await finishSignUp(dependencies) : start;
    setIsSubmitting(false);

    if (refusal) {
      setFailure(refusal);
      return;
    }

    onComplete?.();
  };

  const verifyCode = async (code: string) => {
    const refusal = await verifyEmailCode(dependencies, code);
    if (!refusal) onComplete?.();

    return refusal;
  };

  if (isAwaitingEmailCode) {
    return (
      <EmailCodeStep
        email={signUp.emailAddress ?? values.email}
        onVerify={verifyCode}
        onResend={() => sendEmailCode(signUp)}
        onChangeEmail={() => setIsAwaitingEmailCode(false)}
        className={className}
      />
    );
  }

  return (
    <form
      ref={formRef}
      aria-label="Регистрация"
      noValidate
      onSubmit={submit}
      className={cn("flex flex-col gap-3", className)}
    >
      <GoogleSignUpButton redirectUrl={redirectUrl} />
      <OrDivider />

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Име" autoComplete="given-name" {...fieldProps("firstName")} />
        <TextField label="Фамилия" autoComplete="family-name" {...fieldProps("lastName")} />
      </div>
      <TextField label="Имейл" type="email" autoComplete="email" {...fieldProps("email")} />
      <TextField
        label="Парола"
        type="password"
        autoComplete="new-password"
        {...fieldProps("password")}
      />
      <PhoneField {...fieldProps("phoneNumber")} />

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

function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-[12px] text-ink-3">
      <span className="h-px flex-1 bg-line" />
      или
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/** Asks Clerk for the account; sends the email code when Clerk wants it verified first. */
async function startSignUp(
  signUp: SignUp,
  { email, password, firstName, lastName, phoneNumber }: RegisterCustomerInput,
): Promise<SignUpStart> {
  const unsafeMetadata: RegistrationMetadata = { phoneNumber };
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

  if (signUp.status === "complete") {
    return "complete";
  }

  if (isAwaitingEmailVerification(signUp)) {
    const message = await sendEmailCode(signUp);
    return message ? { field: null, message } : "needs-email-code";
  }

  console.error("Clerk left the sign-up incomplete", signUp.status, signUp.missingFields);
  return { field: null, message: SIGN_UP_FAILED_MESSAGE };
}

function isAwaitingEmailVerification(signUp: SignUp): boolean {
  return (
    signUp.status === "missing_requirements" && signUp.unverifiedFields.includes("email_address")
  );
}

/** Resolves to the message to show, or null once the code is on its way. */
async function sendEmailCode(signUp: SignUp): Promise<string | null> {
  const { error } = await signUp.verifications.sendEmailCode();

  return error ? describeEmailCodeError(error) : null;
}

/** Resolves to the message to show, or null once the account is signed in and filed. */
async function verifyEmailCode(
  dependencies: SignUpDependencies,
  code: string,
): Promise<string | null> {
  const { signUp } = dependencies;
  const { error } = await signUp.verifications.verifyEmailCode({ code });

  if (error) {
    return describeEmailCodeError(error);
  }

  if (signUp.status !== "complete") {
    console.error("Clerk left the verified sign-up incomplete", signUp.status, signUp.missingFields);
    return EMAIL_CODE_FAILED_MESSAGE;
  }

  const refusal = await finishSignUp(dependencies);

  return refusal?.message ?? null;
}

/** Activates the session and files the customer; returns what went wrong, or null. */
async function finishSignUp({
  signUp,
  clerk,
  queryClient,
}: SignUpDependencies): Promise<SignUpErrorMessage | null> {
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
