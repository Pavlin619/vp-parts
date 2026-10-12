import type { ReactNode } from "react";
import { cva } from "class-variance-authority";
import { Check, Phone } from "lucide-react";

export type ContactStatus = "phone-missing" | "signed-in";

const statusBadgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-semibold [&_svg]:h-3.5 [&_svg]:w-3.5",
  {
    variants: {
      status: {
        "phone-missing": "bg-warn-soft text-warn",
        "signed-in": "bg-ok-soft text-ok",
      },
    },
  },
);

const STATUS_CONTENT: Record<ContactStatus, { icon: ReactNode; label: string }> = {
  "phone-missing": { icon: <Phone aria-hidden="true" />, label: "Липсва телефон" },
  "signed-in": { icon: <Check aria-hidden="true" />, label: "Влязъл" },
};

interface ContactIdentityProps {
  firstName: string;
  lastName: string;
  details: string[];
  status: ContactStatus;
}

/** Who is signed in: initials, name, how we reach them and whether the account is complete. */
export function ContactIdentity({ firstName, lastName, details, status }: ContactIdentityProps) {
  const { icon, label } = STATUS_CONTENT[status];

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-[14px] font-semibold text-white"
      >
        {initialsOf(firstName, lastName)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-ink">
          {firstName} {lastName}
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

export function initialsOf(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}
