/**
 * How a retail customer identifies themselves at checkout. Signing in and
 * registering go through Clerk; a quick order needs only the names and a phone.
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

/**
 * The sign-in tab when Clerk has come back to one of its hash routes — a Google
 * sign-in returns to `#/sso-callback`, which only its `<SignIn/>` can finish.
 * Otherwise nothing is preselected: the visitor picks.
 */
export function initialContactMode(hash: string): ContactMode | null {
  return hash.startsWith("#/") ? "login" : null;
}

/** Where signing in or out from the contact panel lands, so the order is not left behind. */
export const CHECKOUT_PATH = "/checkout";
