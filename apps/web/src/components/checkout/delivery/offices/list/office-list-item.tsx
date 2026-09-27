import { DeliveryOfficeType, type DeliveryOfficeDto } from "@vp-parts-shop/shared";
import {
  OFFICE_BLOCK_REASON_COPY,
  type OfficeAvailability,
} from "@/lib/checkout/delivery/office-availability";
import { cn } from "@/lib/utils";
import { LockerTag } from "../locker-tag";
import { OfficePinIcon } from "../office-pin-icon";

interface OfficeListItemProps {
  office: DeliveryOfficeDto;
  availability: OfficeAvailability;
  isHovered: boolean;
  onOpen: (officeCode: string) => void;
  onHover: (officeCode: string | null) => void;
}

/** One office in the list; a click opens it in full. */
export function OfficeListItem({
  office,
  availability,
  isHovered,
  onOpen,
  onHover,
}: OfficeListItemProps) {
  return (
    <button
      type="button"
      data-office-code={office.code}
      disabled={!availability.isSelectable}
      onClick={() => onOpen(office.code)}
      onMouseEnter={() => onHover(office.code)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        "grid w-full grid-cols-[32px_minmax(0,1fr)] items-start gap-3 rounded-lg border border-line bg-bg-card px-3 py-2.5 text-left transition-colors",
        "focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60",
        isHovered && "border-ink-3",
      )}
    >
      <OfficePinIcon carrier={office.carrier} type={office.type} className="h-8 w-8" />

      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-ink">
          {office.name}
          {office.type === DeliveryOfficeType.LOCKER && <LockerTag />}
        </span>
        <span className="text-[12px] text-ink-3">{office.address}</span>
        {!availability.isSelectable && (
          <span className="text-[11px] text-warn">
            {OFFICE_BLOCK_REASON_COPY[availability.reason]}
          </span>
        )}
      </span>
    </button>
  );
}
