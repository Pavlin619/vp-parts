"use client";

import { create } from "zustand";
import {
  EMPTY_QUICK_ORDER_CONTACT,
  type QuickOrderContactField,
  type QuickOrderContactValues,
} from "@/lib/checkout/contact/quick-order-contact";

interface BotCheck {
  /** The Turnstile token the order is sent with; null until solved, and once spent or expired. */
  token: string | null;
  /** Raised each time a token is spent, so the widget starts a fresh challenge. */
  round: number;
  hasFailed: boolean;
}

interface QuickOrderState {
  contact: QuickOrderContactValues;
  botCheck: BotCheck;

  setContactField: (field: QuickOrderContactField, value: string) => void;
  solveBotCheck: (token: string) => void;
  expireBotCheck: () => void;
  failBotCheck: () => void;
  /** Cloudflare accepts a token once, so every attempt that sent one needs the next. */
  spendBotCheck: () => void;
  reset: () => void;
}

const FIRST_BOT_CHECK: BotCheck = { token: null, round: 0, hasFailed: false };

/**
 * What a guest's quick order is sent with. Not persisted: the contact is a
 * stranger's personal data on what may be a shared device.
 */
export const useQuickOrder = create<QuickOrderState>()((set) => ({
  contact: EMPTY_QUICK_ORDER_CONTACT,
  botCheck: FIRST_BOT_CHECK,

  setContactField: (field, value) =>
    set(({ contact }) => ({ contact: { ...contact, [field]: value } })),
  solveBotCheck: (token) =>
    set(({ botCheck }) => ({ botCheck: { ...botCheck, token, hasFailed: false } })),
  expireBotCheck: () => set(({ botCheck }) => ({ botCheck: { ...botCheck, token: null } })),
  failBotCheck: () =>
    set(({ botCheck }) => ({ botCheck: { ...botCheck, token: null, hasFailed: true } })),
  spendBotCheck: () =>
    set(({ botCheck }) => ({ botCheck: { ...FIRST_BOT_CHECK, round: botCheck.round + 1 } })),
  reset: () => set({ contact: EMPTY_QUICK_ORDER_CONTACT, botCheck: FIRST_BOT_CHECK }),
}));
