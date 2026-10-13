"use client";

import { useQuery } from "@tanstack/react-query";
import {
  isProfileComplete,
  type CompleteProfileDetails,
  type CustomerProfileDto,
} from "@vp-parts-shop/shared";
import { AvailabilityLoadError } from "@/components/catalog/availability-load-error";
import { useAccountSetup } from "@/hooks/use-account-setup";
import { customerProfileQueryOptions, isCustomerNotFiled } from "@/lib/api/customers";
import { AccountSetupFailedContact } from "./account-setup-failed-contact";
import { CompleteProfileContact } from "./complete-profile-contact";
import { ContactIdentity, profileNameOf } from "./contact-identity";

/** Who a signed-in customer's order is for, read from their profile. */
export function SignedInContact() {
  const profile = useQuery(customerProfileQueryOptions);
  const accountSetup = useAccountSetup();

  if (accountSetup === "failed") {
    return <AccountSetupFailedContact />;
  }

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

  if (!isProfileComplete(profile.data)) {
    return <CompleteProfileContact profile={profile.data} />;
  }

  return <ContactCard profile={profile.data} />;
}

function ContactCard({ profile }: { profile: CompleteProfileDetails<CustomerProfileDto> }) {
  return (
    <ContactIdentity
      name={profileNameOf(profile)}
      details={[profile.email, profile.phoneNumber]}
      status="signed-in"
    />
  );
}

function SignedInContactSkeleton() {
  return (
    <span
      data-testid="signed-in-contact-skeleton"
      aria-hidden="true"
      className="block h-10 animate-pulse rounded-[10px] bg-bg-sunken"
    />
  );
}
