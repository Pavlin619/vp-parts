"use client";

import type { ReactNode } from "react";
import { useClerk } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { Mail, Phone, User } from "lucide-react";
import type { CustomerProfileDto } from "@vp-parts-shop/shared";
import { AvailabilityLoadError } from "@/components/catalog/availability-load-error";
import { customerProfileQueryOptions, isCustomerNotFiled } from "@/lib/api/customers";
import { CHECKOUT_PATH } from "@/lib/checkout/contact/contact-modes";

/** Who a signed-in customer's order is for, read from their profile. */
export function SignedInContact() {
  const profile = useQuery(customerProfileQueryOptions);

  // The session sync is filing them right now; its answer lands in this query.
  if (profile.isPending || isCustomerNotFiled(profile.error)) {
    return <SignedInContactSkeleton />;
  }

  if (profile.isError) {
    return (
      <AvailabilityLoadError
        title="В момента не можем да заредим профила ви."
        message="Възникна временен проблем. Моля, опитайте отново."
        onRetry={() => void profile.refetch()}
        className="py-6"
      />
    );
  }

  return <ContactCard profile={profile.data} />;
}

function ContactCard({ profile }: { profile: CustomerProfileDto }) {
  const { signOut } = useClerk();

  return (
    <div className="rounded-[10px] border border-line bg-bg-sunken px-4 py-3.5">
      <dl className="flex flex-col gap-1.5 text-[13px] text-ink-2">
        <ContactLine icon={<User />} label="Име">
          <span className="font-semibold text-ink">
            {profile.firstName} {profile.lastName}
          </span>
        </ContactLine>
        <ContactLine icon={<Mail />} label="Имейл">
          {profile.email}
        </ContactLine>
        <ContactLine icon={<Phone />} label="Телефон">
          {profile.phoneNumber}
        </ContactLine>
      </dl>

      <p className="mt-3 text-[12.5px] text-ink-3">
        Не сте вие?{" "}
        <button
          type="button"
          onClick={() => void signOut({ redirectUrl: CHECKOUT_PATH })}
          className="font-semibold text-ink underline-offset-2 hover:underline"
        >
          Изход
        </button>
      </p>
    </div>
  );
}

interface ContactLineProps {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}

function ContactLine({ icon, label, children }: ContactLineProps) {
  return (
    <div className="flex items-center gap-2.5">
      <dt className="text-ink-3 [&_svg]:h-4 [&_svg]:w-4">
        <span aria-hidden="true">{icon}</span>
        <span className="sr-only">{label}</span>
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function SignedInContactSkeleton() {
  return (
    <span
      data-testid="signed-in-contact-skeleton"
      aria-hidden="true"
      className="block h-[118px] animate-pulse rounded-[10px] bg-bg-sunken"
    />
  );
}
