import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OrderCutoffKind,
  WAREHOUSE_META,
  Warehouse,
  warehouseForOwnStock,
} from './warehouse';
import {
  type CivilDate,
  type ShopCalendarConfig,
  addCalendarDays,
  addWorkingDays,
  bgPublicHolidayPredicate,
  hoursFor,
  nextOpenDayOnOrAfter,
  shopCivilToInstant,
  toShopCivil,
} from './working-calendar';

export type DeliveryGranularity = 'HOUR' | 'DAY';

export interface DeliveryProjection {
  /** Absolute instant (ISO UTC). The frontend formats it in the shop tz. */
  earliestAt: string;
  granularity: DeliveryGranularity;
}

export interface WarehouseProjection {
  deliveryWorkDays: number;
  /** The order cut-off shown to the customer, e.g. "17:00". */
  orderCutoffTime: string;
  /** Absolute instant (ISO UTC) of the cut-off on the effective-start day. */
  cutoffAt: string;
  pickup: DeliveryProjection;
  courier: DeliveryProjection;
}

const DEFAULTS = {
  timeZone: 'Europe/Sofia',
  weekdayOpen: 9,
  weekdayClose: 18,
  saturdayOpen: 9,
  saturdayClose: 14,
  sameDayCutoffHour: 11,
  processingCutoffHour: 17,
  withinHourOffsetMinutes: 60,
  courierExtraWorkingDays: 1,
} as const;

/** A point at which the shop is open: the start used for every projection. */
interface EffectiveStart {
  date: CivilDate;
  hour: number;
  minute: number;
}

/**
 * Projects a customer-facing warehouse to concrete pickup/courier delivery
 * dates. All clock reasoning is done in the shop timezone (config-driven), so
 * the result is identical wherever the server runs.
 *
 * TODO(b2b): mechanics will get their own fulfilment overlay (car delivery by
 * default, courier optional). Blocked on Clerk; keep the projection extensible.
 * TODO(supplier-calendar): a "working day" here is any shop-open day. Suppliers
 * that don't operate on Saturdays/holidays are not modelled yet.
 */
@Injectable()
export class DeliveryScheduleService {
  private readonly timeZone: string;
  private readonly sameDayCutoffHour: number;
  private readonly processingCutoffHour: number;
  private readonly withinHourOffsetMinutes: number;
  private readonly courierExtraWorkingDays: number;
  private readonly calendar: ShopCalendarConfig;

  constructor(config: ConfigService) {
    this.timeZone = config.get<string>('SHOP_TIMEZONE') ?? DEFAULTS.timeZone;
    this.sameDayCutoffHour =
      config.get<number>('SAME_DAY_CUTOFF_HOUR') ?? DEFAULTS.sameDayCutoffHour;
    this.processingCutoffHour =
      config.get<number>('NEXT_DAY_PLUS_CUTOFF_HOUR') ??
      DEFAULTS.processingCutoffHour;
    this.withinHourOffsetMinutes =
      config.get<number>('WITHIN_HOUR_OFFSET_MINUTES') ??
      DEFAULTS.withinHourOffsetMinutes;
    this.courierExtraWorkingDays =
      config.get<number>('COURIER_EXTRA_WORKING_DAYS') ??
      DEFAULTS.courierExtraWorkingDays;

    const weekday = this.hours(config, 'WEEKDAY', {
      openHour: DEFAULTS.weekdayOpen,
      closeHour: DEFAULTS.weekdayClose,
    });
    const saturday = this.hours(config, 'SATURDAY', {
      openHour: DEFAULTS.saturdayOpen,
      closeHour: DEFAULTS.saturdayClose,
    });

    this.calendar = {
      timeZone: this.timeZone,
      // Index 0=Sunday .. 6=Saturday.
      weeklyHours: [
        null,
        weekday,
        weekday,
        weekday,
        weekday,
        weekday,
        saturday,
      ],
      isHoliday: bgPublicHolidayPredicate(this.timeZone),
    };
  }

  /** Same as {@link projectWarehouse} but for our own (central) stock. */
  projectOwnStock(now: Date = new Date()): WarehouseProjection {
    return this.projectWarehouse(warehouseForOwnStock(), now);
  }

  projectWarehouse(
    warehouse: Warehouse,
    now: Date = new Date(),
  ): WarehouseProjection {
    const meta = WAREHOUSE_META[warehouse];
    const start = this.effectiveStart(now);

    const cutoffHour = this.cutoffHour(meta.cutoffKind, start.date);
    const madeCutoff = start.hour < cutoffHour;
    const dispatchDate = madeCutoff
      ? start.date
      : nextOpenDayOnOrAfter(addCalendarDays(start.date, 1), this.calendar);
    const deliveryDate = addWorkingDays(
      dispatchDate,
      meta.baseWorkDays,
      this.calendar,
    );

    return {
      deliveryWorkDays: meta.baseWorkDays,
      orderCutoffTime: formatHour(cutoffHour),
      cutoffAt: shopCivilToInstant(
        { ...start.date, hour: cutoffHour, minute: 0 },
        this.timeZone,
      ).toISOString(),
      pickup: this.pickupProjection(warehouse, start, now, deliveryDate),
      courier: this.courierProjection(deliveryDate),
    };
  }

  private pickupProjection(
    warehouse: Warehouse,
    start: EffectiveStart,
    now: Date,
    deliveryDate: CivilDate,
  ): DeliveryProjection {
    const deliveringToday = isSameCivilDate(
      deliveryDate,
      toShopCivil(now, this.timeZone),
    );

    if (warehouse === Warehouse.CENTRAL && deliveringToday) {
      return this.withinHourProjection(start);
    }

    return this.dayProjection(deliveryDate);
  }

  /**
   * "Within the hour" as a concrete clock time, clamped to the shop close.
   * TODO(within-hour-edge): an order ~1h before close (e.g. 17:30 -> 18:30) is
   * clamped to the close time; confirm the desired behaviour with the business.
   */
  private withinHourProjection(start: EffectiveStart): DeliveryProjection {
    const close = hoursFor(start.date, this.calendar)?.closeHour ?? 24;
    const rawMinutes =
      start.hour * 60 + start.minute + this.withinHourOffsetMinutes;
    const minutes = Math.min(rawMinutes, close * 60);

    return {
      earliestAt: shopCivilToInstant(
        {
          ...start.date,
          hour: Math.floor(minutes / 60),
          minute: minutes % 60,
        },
        this.timeZone,
      ).toISOString(),
      granularity: 'HOUR',
    };
  }

  private dayProjection(date: CivilDate): DeliveryProjection {
    // Noon keeps the instant unambiguously on the intended civil day.
    return {
      earliestAt: shopCivilToInstant(
        { ...date, hour: 12, minute: 0 },
        this.timeZone,
      ).toISOString(),
      granularity: 'DAY',
    };
  }

  private courierProjection(pickupDate: CivilDate): DeliveryProjection {
    const courierDate = addWorkingDays(
      pickupDate,
      this.courierExtraWorkingDays,
      this.calendar,
    );
    return this.dayProjection(courierDate);
  }

  private cutoffHour(kind: OrderCutoffKind, date: CivilDate): number {
    switch (kind) {
      case OrderCutoffKind.SHOP_CLOSE:
        return (
          hoursFor(date, this.calendar)?.closeHour ?? DEFAULTS.weekdayClose
        );
      case OrderCutoffKind.SAME_DAY:
        return this.sameDayCutoffHour;
      case OrderCutoffKind.PROCESSING:
        return this.processingCutoffHour;
    }
  }

  /** Normalises `now` to the next moment the shop is open. */
  private effectiveStart(now: Date): EffectiveStart {
    const civil = toShopCivil(now, this.timeZone);
    const today: CivilDate = {
      year: civil.year,
      month: civil.month,
      day: civil.day,
    };
    const todayHours = hoursFor(today, this.calendar);

    if (todayHours && civil.hour < todayHours.closeHour) {
      const hour = Math.max(civil.hour, todayHours.openHour);
      const minute = civil.hour < todayHours.openHour ? 0 : civil.minute;
      return { date: today, hour, minute };
    }

    const open = nextOpenDayOnOrAfter(addCalendarDays(today, 1), this.calendar);
    return {
      date: open,
      hour: hoursFor(open, this.calendar)!.openHour,
      minute: 0,
    };
  }

  private hours(
    config: ConfigService,
    band: 'WEEKDAY' | 'SATURDAY',
    fallback: { openHour: number; closeHour: number },
  ): { openHour: number; closeHour: number } {
    return {
      openHour:
        config.get<number>(`SHOP_HOURS_${band}_OPEN`) ?? fallback.openHour,
      closeHour:
        config.get<number>(`SHOP_HOURS_${band}_CLOSE`) ?? fallback.closeHour,
    };
  }
}

function isSameCivilDate(a: CivilDate, b: CivilDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}
