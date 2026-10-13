import type { ReactNode } from "react";
import { cva } from "class-variance-authority";
import type { CustomerProfileDto } from "@vp-parts-shop/shared";
import { Check, Phone, UserPen } from "lucide-react";

export type ContactStatus = "phone-missing" | "details-missing" | "signed-in";

const statusBadgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-semibold [&_svg]:h-3.5 [&_svg]:w-3.5",
  {
    variants: {
      status: {
        "phone-missing": "bg-warn-soft text-warn",
        "details-missing": "bg-warn-soft text-warn",
        "signed-in": "bg-ok-soft text-ok",
      },
    },
  },
);

const STATUS_CONTENT: Record<ContactStatus, { icon: ReactNode; label: string }> = {
  "phone-missing": { icon: <Phone aria-hidden="true" />, label: "Липсва телефон" },
  "details-missing": { icon: <UserPen aria-hidden="true" />, label: "Непълен профил" },
  "signed-in": { icon: <Check aria-hidden="true" />, label: "Влязъл" },
};

interface ContactIdentityProps {
  name: string;
  details: string[];
  status: ContactStatus;
}

/** Who is signed in: initials, name, how we reach them and whether the account is complete. */
export function ContactIdentity({ name, details, status }: ContactIdentityProps) {
  const { icon, label } = STATUS_CONTENT[status];

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-[14px] font-semibold text-white"
      >
        {initialsOf(name)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-ink">
          {name}
        </p>
        <p className="break-words text-[13px] text-ink-3">{details.join(" · ")}</p>
      </div>

      <span className={statusBadgeVariants({ status })}>
        {icon}
        {label}
      </span>
    </div>
  );
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();
}

export function profileNameOf({
  firstName,
  lastName,
}: Pick<CustomerProfileDto, "firstName" | "lastName">): string {
  return [firstName, lastName].filter(Boolean).join(" ");
}
