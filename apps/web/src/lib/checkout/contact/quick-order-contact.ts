import { quickOrderContactSchema, type QuickOrderContactDto } from "@vp-parts-shop/shared";
import { REGISTRATION_FIELD_MESSAGES } from "@/lib/auth/registration-values";

export type QuickOrderContactField = keyof Required<QuickOrderContactDto>;

export type QuickOrderContactValues = Record<QuickOrderContactField, string>;

export const EMPTY_QUICK_ORDER_CONTACT: QuickOrderContactValues = {
  firstName: "",
  lastName: "",
  phoneNumber: "",
  email: "",
};

export type QuickOrderContactValidation =
  | { success: true; data: QuickOrderContactDto }
  | { success: false; errors: Partial<Record<QuickOrderContactField, string>> };

/** Checked against the schema the API checks the order with, and worded as registration is. */
export function validateQuickOrderContact(
  values: QuickOrderContactValues,
): QuickOrderContactValidation {
  const email = values.email.trim();
  const result = quickOrderContactSchema.safeParse({
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    phoneNumber: values.phoneNumber,
    ...(email && { email }),
  });

  if (result.success) {
    return { success: true, data: result.data };
  }

  const fields = new Set(result.error.issues.map((issue) => issue.path[0]));
  const errors = Object.fromEntries(
    (Object.keys(EMPTY_QUICK_ORDER_CONTACT) as QuickOrderContactField[])
      .filter((field) => fields.has(field))
      .map((field) => [field, REGISTRATION_FIELD_MESSAGES[field]]),
  );

  return { success: false, errors };
}
