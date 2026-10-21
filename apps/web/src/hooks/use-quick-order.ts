"use client";

import { create } from "zustand";
import {
  EMPTY_QUICK_ORDER_CONTACT,
  type QuickOrderContactField,
  type QuickOrderContactValues,
} from "@/lib/checkout/contact/quick-order-contact";

interface BotCheck {
  /** Runs Cloudflare's challenge and answers a fresh token; null until the widget has loaded. */
  solve: (() => Promise<string>) | null;
  hasFailed: boolean;
}

interface QuickOrderState {
  contact: QuickOrderContactValues;
  botCheck: BotCheck;

  setContactField: (field: QuickOrderContactField, value: string) => void;
  setBotCheckSolver: (solve: (() => Promise<string>) | null) => void;
  passBotCheck: () => void;
  failBotCheck: () => void;
  /** Forgets the contact; the widget stays loaded for the next order. */
  reset: () => void;
}

/**
 * What a guest's quick order is sent with. Not persisted: the contact is a
 * stranger's personal data on what may be a shared device.
 */
export const useQuickOrder = create<QuickOrderState>()((set) => ({
  contact: EMPTY_QUICK_ORDER_CONTACT,
  botCheck: { solve: null, hasFailed: false },

  setContactField: (field, value) =>
    set(({ contact }) => ({ contact: { ...contact, [field]: value } })),
  setBotCheckSolver: (solve) => set(({ botCheck }) => ({ botCheck: { ...botCheck, solve } })),
  passBotCheck: () => set(({ botCheck }) => ({ botCheck: { ...botCheck, hasFailed: false } })),
  failBotCheck: () => set(({ botCheck }) => ({ botCheck: { ...botCheck, hasFailed: true } })),
  reset: () =>
    set(({ botCheck }) => ({
      contact: EMPTY_QUICK_ORDER_CONTACT,
      botCheck: { ...botCheck, hasFailed: false },
    })),
}));
