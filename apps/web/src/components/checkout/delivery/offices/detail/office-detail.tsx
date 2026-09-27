"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ChevronLeft, Clock, MapPin } from "lucide-react";
import { DeliveryOfficeType, type DeliveryOfficeDto } from "@vp-parts-shop/shared";
import { officeHoursTable } from "@/lib/checkout/delivery/office-hours";
import {
  OFFICE_BLOCK_REASON_COPY,
  type OfficeAvailability,
} from "@/lib/checkout/delivery/office-availability";
import { LockerTag } from "../locker-tag";
import { OfficeHoursTable } from "./office-hours-table";
import { OfficePinIcon } from "../office-pin-icon";

interface OfficeDetailProps {
  office: DeliveryOfficeDto;
  availability: OfficeAvailability;
  onBack: () => void;
  onChoose: (officeCode: string) => void;
}

/** One office in full, in place of the list: where it is, when it opens, and the button that picks it. */
export function OfficeDetail({ office, availability, onBack, onChoose }: OfficeDetailProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hoursRows = officeHoursTable(office);

  // The row or pin that opened this is gone or elsewhere, so keyboard focus follows the office.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [office.code]);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line bg-bg-card p-4">
      <button
        type="button"
        onClick={onBack}
        className="-ml-1 inline-flex items-center gap-0.5 self-start text-[12.5px] font-semibold text-accent-hover hover:underline"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Назад
      </button>

      <div className="flex items-start gap-3">
        <OfficePinIcon
          carrier={office.carrier}
          type={office.type}
          className="h-10 w-10"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <h3
            ref={headingRef}
            tabIndex={-1}
            className="text-[16px] font-semibold text-ink outline-none"
          >
            {office.name}
          </h3>
          {office.type === DeliveryOfficeType.LOCKER && <LockerTag />}
        </div>
      </div>

      {availability.isSelectable ? (
        <button
          type="button"
          onClick={() => onChoose(office.code)}
          className="inline-flex h-[42px] w-full items-center justify-center rounded-lg bg-ink text-[13.5px] font-semibold text-white transition-colors hover:bg-ink-2 focus-visible:outline-2 focus-visible:outline-accent"
        >
          Вземи от този офис
        </button>
      ) : (
        <p className="text-[12px] text-warn">{OFFICE_BLOCK_REASON_COPY[availability.reason]}</p>
      )}

      <DetailSection icon={<MapPin className="h-[18px] w-[18px]" />} title="Адрес">
        <p className="text-[12.5px] text-ink-2">{office.address}</p>
        <a
          href={googleMapsUrl(office)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[12.5px] font-medium text-info hover:underline"
        >
          Отвори в Google Maps
        </a>
      </DetailSection>

      {hoursRows.length > 0 && (
        <DetailSection icon={<Clock className="h-[18px] w-[18px]" />} title="Работно време">
          <OfficeHoursTable rows={hoursRows} />
        </DetailSection>
      )}
    </div>
  );
}

function DetailSection({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="grid grid-cols-[18px_minmax(0,1fr)] gap-x-3 border-t border-line pt-3.5">
      <span aria-hidden="true" className="pt-px text-ink-3">
        {icon}
      </span>
      <div className="flex flex-col gap-1">
        <h4 className="text-[13px] font-semibold text-ink">{title}</h4>
        {children}
      </div>
    </section>
  );
}

function googleMapsUrl({ latitude, longitude }: DeliveryOfficeDto): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}
