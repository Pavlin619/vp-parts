import type { DeliveryOfficeDto, DeliveryOfficeHoursDto } from "@vp-parts-shop/shared";

type OfficeHours = Pick<DeliveryOfficeDto, "weekdayHours" | "saturdayHours">;

export interface OfficeHoursRow {
  days: string;
  /** Null when the office is closed on those days. */
  hours: string | null;
}

export function formatOfficeHours({
  weekdayHours,
  saturdayHours,
}: OfficeHours): string | null {
  if (!weekdayHours) {
    return null;
  }

  if (isRoundTheClock({ weekdayHours, saturdayHours })) {
    return "Денонощно";
  }

  const saturday = saturdayHours ? formatRange(saturdayHours) : "почивен ден";

  return `Пн–Пт ${formatRange(weekdayHours)} · Сб ${saturday}`;
}

export function officeHoursTable(office: OfficeHours): OfficeHoursRow[] {
  if (!office.weekdayHours) {
    return [];
  }

  if (isRoundTheClock(office)) {
    return [{ days: "Всеки ден", hours: "00:00–24:00" }];
  }

  return [
    { days: "Пн–Пт", hours: formatRange(office.weekdayHours) },
    { days: "Сб", hours: office.saturdayHours ? formatRange(office.saturdayHours) : null },
    { days: "Нд", hours: null },
  ];
}

function formatRange({ opensAt, closesAt }: DeliveryOfficeHoursDto): string {
  return `${opensAt}–${closesAt}`;
}

function isRoundTheClock({ weekdayHours, saturdayHours }: OfficeHours): boolean {
  return (
    weekdayHours !== null &&
    saturdayHours !== null &&
    isAllDay(weekdayHours) &&
    isAllDay(saturdayHours)
  );
}

function isAllDay({ opensAt, closesAt }: DeliveryOfficeHoursDto): boolean {
  return opensAt === "00:00" && closesAt === "23:59";
}
