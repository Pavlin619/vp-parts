import { isClerkAPIResponseError } from "@clerk/nextjs/errors";

export type RegistrationField = "firstName" | "lastName" | "email" | "password" | "phoneNumber";

export interface SignUpErrorMessage {
  /** The field to show it under, or null for an error about the whole form. */
  field: RegistrationField | null;
  message: string;
}

export const SIGN_UP_FAILED_MESSAGE = "Регистрацията не успя. Опитайте отново.";

export const EMAIL_CODE_FAILED_MESSAGE = "Потвърждението не успя. Опитайте отново.";

const TOO_MANY_REQUESTS = "Твърде много опити. Опитайте отново след малко.";

const CAPTCHA_FAILED: SignUpErrorMessage = {
  field: null,
  message: "Проверката срещу ботове не мина. Презаредете страницата и опитайте отново.",
};

const MESSAGES_BY_CODE: Record<string, SignUpErrorMessage> = {
  form_identifier_exists: {
    field: "email",
    message: "Вече има профил с този имейл. Влезте в него.",
  },
  form_password_pwned: {
    field: "password",
    message: "Тази парола е изтекла при пробив в друг сайт. Изберете друга.",
  },
  form_password_length_too_short: {
    field: "password",
    message: "Паролата трябва да е поне 8 символа.",
  },
  form_password_not_strong_enough: {
    field: "password",
    message: "Паролата е твърде слаба. Добавете още символи.",
  },
  captcha_invalid: CAPTCHA_FAILED,
  captcha_unavailable: CAPTCHA_FAILED,
  captcha_missing_token: CAPTCHA_FAILED,
  too_many_requests: { field: null, message: TOO_MANY_REQUESTS },
};

const EMAIL_CODE_MESSAGES_BY_CODE: Record<string, string> = {
  form_code_incorrect: "Грешен код. Проверете имейла и опитайте отново.",
  verification_expired: "Кодът е изтекъл. Изпратете нов.",
  verification_failed: "Твърде много грешни опити. Изпратете нов код.",
  too_many_requests: TOO_MANY_REQUESTS,
};

const INVALID_FORMAT_BY_PARAM: Record<string, SignUpErrorMessage> = {
  email_address: { field: "email", message: "Въведете валиден имейл" },
  password: { field: "password", message: "Паролата не е валидна." },
  first_name: { field: "firstName", message: "Въведете име" },
  last_name: { field: "lastName", message: "Въведете фамилия" },
};

const GENERIC: SignUpErrorMessage = { field: null, message: SIGN_UP_FAILED_MESSAGE };

/** Clerk's sign-up error in Bulgarian; `bgBG` localizes only Clerk's own components. */
export function describeSignUpError(error: unknown): SignUpErrorMessage {
  if (!isClerkAPIResponseError(error)) {
    return GENERIC;
  }

  const [first] = error.errors;

  if (first?.code === "form_param_format_invalid") {
    return INVALID_FORMAT_BY_PARAM[first.meta?.paramName] ?? GENERIC;
  }

  return MESSAGES_BY_CODE[first?.code ?? ""] ?? GENERIC;
}

/** Clerk's refusal of an email code, or of sending one, in Bulgarian. */
export function describeEmailCodeError(error: unknown): string {
  if (!isClerkAPIResponseError(error)) {
    return EMAIL_CODE_FAILED_MESSAGE;
  }

  return EMAIL_CODE_MESSAGES_BY_CODE[error.errors[0]?.code ?? ""] ?? EMAIL_CODE_FAILED_MESSAGE;
}
