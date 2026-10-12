"use client";

import { useUser } from "@clerk/nextjs";
import { Phone } from "lucide-react";
import { PhoneField } from "@/components/auth/phone-field";
import { Button } from "@/components/ui/button";
import { PRIMARY_ACTION_CLASS } from "@/components/checkout/delivery/address/address-action-buttons";
import { useCompleteProfile } from "@/hooks/use-complete-profile";
import { cn } from "@/lib/utils";
import { ContactIdentity } from "./contact-identity";

interface CompleteProfileContactProps {
  onComplete: () => void;
}

/**
 * Checkout's contact panel for a signed-in customer Clerk holds no phone for:
 * asks for it in place, where the order needs it.
 */
export function CompleteProfileContact({ onComplete }: CompleteProfileContactProps) {
  const { user } = useUser();
  const profile = useCompleteProfile(onComplete);
  const email = user?.primaryEmailAddress?.emailAddress;

  return (
    <div>
      <ContactIdentity
        firstName={user?.firstName ?? ""}
        lastName={user?.lastName ?? ""}
        details={email ? [email] : []}
        status="phone-missing"
      />

      <div className="mt-4 border-t border-line pt-4">
        <p className="text-[14px] font-semibold text-ink">Остава само телефонът</p>
        <p className="mt-1 max-w-[520px] text-[13px] text-ink-3">
          Добавете мобилен телефон, за да завършим профила ви. По него ще ви се обадим за
          поръчката и доставката.
        </p>

        <form noValidate onSubmit={profile.submit} className="mt-3.5 flex flex-col gap-3">
          <PhoneField
            label="Мобилен телефон"
            icon={<Phone />}
            value={profile.phoneNumber}
            onValueChange={profile.changePhoneNumber}
            onBlur={profile.markTouched}
            error={profile.phoneError}
            action={
              <Button
                type="submit"
                disabled={profile.isSubmitting}
                className={cn(PRIMARY_ACTION_CLASS, "h-[42px] shrink-0 px-5 text-[14px]")}
              >
                {profile.isSubmitting ? "Запазваме…" : "Запази телефона"}
              </Button>
            }
          />

          {profile.failure && (
            <p role="alert" className="text-[12.5px] text-danger">
              {profile.failure}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
