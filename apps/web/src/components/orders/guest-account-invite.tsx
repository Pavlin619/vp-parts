"use client";

import Link from "next/link";
import { UserPlus } from "lucide-react";
import type { OrderContactDto } from "@vp-parts-shop/shared";
import { buttonVariants } from "@/components/ui/button";
import { useRegistrationDraft } from "@/hooks/use-registration-draft";
import { cn } from "@/lib/utils";

/**
 * Offered after a guest's order, never before it (delayed account creation).
 * This order stays a guest's: linking one to an account waits on a verified email.
 */
export function GuestAccountInvite({ contact }: { contact: OrderContactDto }) {
  const setDraft = useRegistrationDraft((state) => state.setDraft);
  const { email, ...details } = contact;

  return (
    <section className="flex flex-col gap-3.5 rounded-[12px] border border-line bg-bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2.5 text-[13px] leading-normal text-ink-2">
        <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
        <span>
          <b className="font-semibold text-ink">Създайте профил</b>, за да поръчвате по-бързо и да
          следите следващите си поръчки.
        </span>
      </p>
      <Link
        href="/sign-up"
        onClick={() => setDraft(email ? { ...details, email } : details)}
        className={cn(buttonVariants({ size: "lg" }), "h-10 shrink-0 rounded-md px-4 max-sm:w-full")}
      >
        Създайте профил
      </Link>
    </section>
  );
}
