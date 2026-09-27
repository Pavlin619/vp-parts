import type { OfficeHoursRow } from "@/lib/checkout/delivery/office-hours";

export function OfficeHoursTable({ rows }: { rows: OfficeHoursRow[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-[3px] text-[11.5px] text-ink-3">
      {rows.map(({ days, hours }) => (
        <div key={days} className="contents">
          <dt>{days}</dt>
          <dd className={hours ? "font-semibold text-ink" : undefined}>{hours ?? "затворено"}</dd>
        </div>
      ))}
    </dl>
  );
}
