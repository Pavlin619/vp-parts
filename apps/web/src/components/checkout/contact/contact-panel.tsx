"use client";

import { useId, type ReactNode } from "react";
import { SignIn, useAuth } from "@clerk/nextjs";
import { Phone, Plus, User } from "lucide-react";
import { RegistrationForm } from "@/components/auth/registration-form";
import {
  CHECKOUT_PATH,
  CONTACT_MODES,
  type ContactMode,
} from "@/lib/checkout/contact/contact-modes";
import { DeliveryOptionCard } from "../delivery";
import { QuickOrderFields } from "./quick-order-fields";
import { SignedInContact } from "./signed-in-contact";

const MODE_ICONS: Record<ContactMode, ReactNode> = {
  login: <User />,
  register: <Plus />,
  quick: <Phone />,
};

// Clerk's own "sign up" link would leave checkout; our registration tab sits beside it.
const CHECKOUT_SIGN_IN_APPEARANCE = {
  options: { elevation: "flush" },
  elements: { footerAction: { display: "none" } },
} as const;

interface ContactPanelProps {
  mode: ContactMode;
  onModeChange: (mode: ContactMode) => void;
}

/** Who the order is for: the signed-in customer, or how a guest identifies themselves. */
export function ContactPanel({ mode, onModeChange }: ContactPanelProps) {
  const titleId = useId();
  const { isLoaded, isSignedIn } = useAuth();

  return (
    <section className="rounded-[12px] border border-line bg-bg-card p-5">
      <h2
        id={titleId}
        className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3"
      >
        Данни за контакт
      </h2>

      {!isLoaded && <ContactPanelSkeleton />}

      {isLoaded && isSignedIn && <SignedInContact />}

      {isLoaded && !isSignedIn && (
        <>
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

          <GuestContact mode={mode} />
        </>
      )}
    </section>
  );
}

function GuestContact({ mode }: { mode: ContactMode }) {
  switch (mode) {
    case "login":
      return (
        <div className="mt-3.5 flex justify-center">
          <SignIn
            routing="hash"
            forceRedirectUrl={CHECKOUT_PATH}
            appearance={CHECKOUT_SIGN_IN_APPEARANCE}
          />
        </div>
      );
    case "register":
      return <RegistrationForm className="mt-3.5" />;
    case "quick":
      return <QuickOrderFields />;
  }
}

function ContactPanelSkeleton() {
  return (
    <span
      data-testid="contact-panel-skeleton"
      aria-hidden="true"
      className="block h-[204px] animate-pulse rounded-[10px] bg-bg-sunken"
    />
  );
}
