/**
 * How a retail customer identifies themselves at checkout. Signing in and
 * registering go through Clerk; a quick order needs only a name and a phone.
 */
export type ContactMode = "login" | "register" | "quick";

export interface ContactModeOption {
  id: ContactMode;
  label: string;
  description: string;
}

export const CONTACT_MODES: readonly ContactModeOption[] = [
  { id: "login", label: "Вход", description: "Имам профил във VP Parts" },
  {
    id: "register",
    label: "Регистрация",
    description: "Създайте профил и следете поръчките си",
  },
  { id: "quick", label: "Бърза поръчка", description: "Само име и телефон, без профил" },
];

export const DEFAULT_CONTACT_MODE: ContactMode = "quick";

const MIN_NAME_LENGTH = 3;
const MIN_PHONE_DIGITS = 9;

export function contactNameError(name: string): string | undefined {
  return name.trim().length < MIN_NAME_LENGTH ? "Въведете име и фамилия" : undefined;
}

export function contactPhoneError(phone: string): string | undefined {
  const digitCount = phone.replace(/\D/g, "").length;

  return digitCount < MIN_PHONE_DIGITS ? "Въведете валиден телефонен номер" : undefined;
}
