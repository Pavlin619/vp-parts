import { registerCustomerSchema, type RegisterCustomerInput } from "@vp-parts-shop/shared";
import type { RegistrationField } from "./clerk-errors";

export type RegistrationValues = Record<RegistrationField, string>;

export const EMPTY_REGISTRATION: RegistrationValues = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  phoneNumber: "",
};

export type RegistrationErrors = Partial<Record<RegistrationField, string>>;

export type RegistrationValidation =
  | { success: true; data: RegisterCustomerInput }
  | { success: false; errors: RegistrationErrors };

const FIELD_MESSAGES: Record<keyof RegistrationErrors, string> = {
  firstName: "Въведете име (без цифри)",
  lastName: "Въведете фамилия (без цифри)",
  email: "Въведете валиден имейл",
  password: "Паролата трябва да е поне 8 символа.",
  phoneNumber: "Въведете валиден мобилен номер",
};

/**
 * Checks the form against the schema the API files the customer with, so once
 * Clerk accepts the sign-up, filing it can fail only on transport.
 */
export function validateRegistration(values: RegistrationValues): RegistrationValidation {
  const result = registerCustomerSchema.safeParse({
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    email: values.email.trim(),
    password: values.password,
    phoneNumber: values.phoneNumber,
  });

  if (result.success) {
    return { success: true, data: result.data };
  }

  const fields = new Set(result.error.issues.map((issue) => issue.path[0]));
  const errors = Object.fromEntries(
    Object.entries(FIELD_MESSAGES).filter(([field]) => fields.has(field)),
  );

  return { success: false, errors };
}
