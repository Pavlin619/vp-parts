"use client";

import { Phone } from "lucide-react";
import type { CustomerProfileDto } from "@vp-parts-shop/shared";
import { PhoneField } from "@/components/auth/phone-field";
import { Button } from "@/components/ui/button";
import { PRIMARY_ACTION_CLASS } from "@/components/checkout/delivery/address/address-action-buttons";
import { TextField } from "@/components/common/text-field";
import { useCompleteProfile } from "@/hooks/use-complete-profile";
import { cn } from "@/lib/utils";
import { ContactIdentity, profileNameOf } from "./contact-identity";

interface CompleteProfileContactProps {
  profile: CustomerProfileDto;
}

/**
 * Checkout's contact panel for a customer whose profile lacks a name or the
 * phone — a Google sign-in. Asks for just those, in place, where the order needs them.
 */
export function CompleteProfileContact({ profile }: CompleteProfileContactProps) {
  const form = useCompleteProfile(profile);
  const isPhoneOnly = form.missing.length === 1 && form.missing[0] === "phoneNumber";
  const name = profileNameOf(profile);

  const submitButton = (
    <Button
      type="submit"
      disabled={form.isSubmitting}
      className={cn(PRIMARY_ACTION_CLASS, isPhoneOnly && "h-[42px] shrink-0 px-5 text-[14px]")}
    >
      {submitLabel(form.isSubmitting, isPhoneOnly)}
    </Button>
  );

  return (
    <div>
      <ContactIdentity
        name={name || profile.email}
        details={name ? [profile.email] : []}
        status={isPhoneOnly ? "phone-missing" : "details-missing"}
      />

      <div className="mt-4 border-t border-line pt-4">
        <p className="text-[14px] font-semibold text-ink">
          {isPhoneOnly ? "Остава само телефонът" : "Допълнете профила си"}
        </p>
        <p className="mt-1 max-w-[520px] text-[13px] text-ink-3">
          {isPhoneOnly
            ? "Добавете мобилен телефон, за да завършим профила ви."
            : "Добавете липсващите данни, за да завършим профила ви."}{" "}
          По телефона ще ви се обадим за поръчката и доставката.
        </p>

        <form noValidate onSubmit={form.submit} className="mt-3.5 flex flex-col gap-3">
          {(form.missing.includes("firstName") || form.missing.includes("lastName")) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {form.missing.includes("firstName") && (
                <TextField label="Име" autoComplete="given-name" {...form.fieldProps("firstName")} />
              )}
              {form.missing.includes("lastName") && (
                <TextField
                  label="Фамилия"
                  autoComplete="family-name"
                  {...form.fieldProps("lastName")}
                />
              )}
            </div>
          )}

          {form.missing.includes("phoneNumber") && (
            <PhoneField
              label="Мобилен телефон"
              icon={<Phone />}
              {...form.fieldProps("phoneNumber")}
              action={isPhoneOnly ? submitButton : undefined}
            />
          )}

          {!isPhoneOnly && submitButton}

          {form.failure && (
            <p role="alert" className="text-[12.5px] text-danger">
              {form.failure}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

function submitLabel(isSubmitting: boolean, isPhoneOnly: boolean): string {
  if (isSubmitting) return "Запазваме…";

  return isPhoneOnly ? "Запази телефона" : "Запази данните";
}
