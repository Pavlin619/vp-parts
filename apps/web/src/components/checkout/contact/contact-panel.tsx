"use client";

import { useId, type ReactNode } from "react";
import { Phone, Plus, User } from "lucide-react";
import { CONTACT_MODES, type ContactMode } from "@/lib/checkout/contact/contact-modes";
import { DeliveryOptionCard } from "../delivery";
import { QuickOrderFields } from "./quick-order-fields";

const MODE_ICONS: Record<ContactMode, ReactNode> = {
  login: <User />,
  register: <Plus />,
  quick: <Phone />,
};

interface ContactPanelProps {
  mode: ContactMode;
  onModeChange: (mode: ContactMode) => void;
}

/** Who the order is for. Sign-in and registration mount Clerk's UI here once it lands. */
export function ContactPanel({ mode, onModeChange }: ContactPanelProps) {
  const titleId = useId();

  return (
    <section className="rounded-[12px] border border-line bg-bg-card p-5">
      <h2
        id={titleId}
        className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3"
      >
        Данни за контакт
      </h2>

      <div role="radiogroup" aria-labelledby={titleId} className="flex flex-col gap-2">
        {CONTACT_MODES.map((option) => (
          <DeliveryOptionCard
            key={option.id}
            name="contact-mode"
            value={option.id}
            label={option.label}
            description={option.description}
            icon={MODE_ICONS[option.id]}
            isSelected={mode === option.id}
            onSelect={() => onModeChange(option.id)}
          />
        ))}
      </div>

      {mode === "quick" && <QuickOrderFields />}
    </section>
  );
}
