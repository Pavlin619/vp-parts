import { ConfigService } from '@nestjs/config';
import { DeliveryScheduleService } from './delivery-schedule.service';
import { Warehouse } from './warehouse';
import { toShopCivil } from './working-calendar';

const SOFIA = 'Europe/Sofia';

const DEFAULTS: Record<string, unknown> = {
  SHOP_TIMEZONE: SOFIA,
  SHOP_HOURS_WEEKDAY_OPEN: 9,
  SHOP_HOURS_WEEKDAY_CLOSE: 18,
  SHOP_HOURS_SATURDAY_OPEN: 9,
  SHOP_HOURS_SATURDAY_CLOSE: 14,
  SAME_DAY_CUTOFF_HOUR: 11,
  NEXT_DAY_PLUS_CUTOFF_HOUR: 17,
  WITHIN_HOUR_OFFSET_MINUTES: 60,
  COURIER_EXTRA_WORKING_DAYS: 1,
};

function makeService(
  overrides: Record<string, unknown> = {},
): DeliveryScheduleService {
  const values = { ...DEFAULTS, ...overrides };
  const config = {
    get: <T>(key: string): T => values[key] as T,
  } as unknown as ConfigService;
  return new DeliveryScheduleService(config);
}

/** Shop-local YYYY-MM-DD of a projection's earliestAt, for DAY assertions. */
function deliveryDay(earliestAt: string): string {
  const civil = toShopCivil(new Date(earliestAt), SOFIA);
  return `${civil.year}-${String(civil.month).padStart(2, '0')}-${String(
    civil.day,
  ).padStart(2, '0')}`;
}

describe('DeliveryScheduleService', () => {
  const service = makeService();

  // Reference instants (Sofia is UTC+3 in summer, UTC+2 in winter).
  const THU_1012 = new Date('2026-06-25T07:12:00Z'); // Thu 10:12 Sofia
  const THU_0300 = new Date('2026-06-25T00:00:00Z'); // Thu 03:00 Sofia (pre-open)
  const THU_2000 = new Date('2026-06-25T17:00:00Z'); // Thu 20:00 Sofia (after close)
  const THU_1130 = new Date('2026-06-25T08:30:00Z'); // Thu 11:30 Sofia
  const THU_1600 = new Date('2026-06-25T13:00:00Z'); // Thu 16:00 Sofia
  const THU_1730 = new Date('2026-06-25T14:30:00Z'); // Thu 17:30 Sofia
  const SAT_1330 = new Date('2026-06-27T10:30:00Z'); // Sat 13:30 Sofia
  const SUN_1000 = new Date('2026-06-28T07:00:00Z'); // Sun 10:00 Sofia

  describe('central warehouse (within the hour)', () => {
    it('projects a clock time one hour out during opening hours', () => {
      const result = service.projectWarehouse(Warehouse.CENTRAL, THU_1012);

      expect(result.deliveryWorkDays).toBe(0);
      expect(result.orderCutoffTime).toBe('18:00');
      expect(result.pickup.granularity).toBe('HOUR');
      expect(result.pickup.earliestAt).toBe('2026-06-25T08:12:00.000Z'); // 11:12 Sofia
      // Cut-off is the 18:00 shop close, as an absolute instant (15:00Z summer).
      expect(result.cutoffAt).toBe('2026-06-25T15:00:00.000Z');
    });

    it('projects "one hour after opening" before the shop opens', () => {
      const result = service.projectWarehouse(Warehouse.CENTRAL, THU_0300);

      expect(result.pickup.granularity).toBe('HOUR');
      expect(result.pickup.earliestAt).toBe('2026-06-25T07:00:00.000Z'); // 10:00 Sofia
    });

    it('rolls to the next working day (DAY) when ordered after close', () => {
      const result = service.projectWarehouse(Warehouse.CENTRAL, THU_2000);

      expect(result.pickup.granularity).toBe('DAY');
      expect(deliveryDay(result.pickup.earliestAt)).toBe('2026-06-26'); // Fri
    });

    it('clamps the within-hour time to closing and shows the Saturday cutoff', () => {
      const result = service.projectWarehouse(Warehouse.CENTRAL, SAT_1330);

      // 13:30 + 1h = 14:30, clamped to the 14:00 Saturday close.
      expect(result.orderCutoffTime).toBe('14:00');
      expect(result.pickup.granularity).toBe('HOUR');
      expect(result.pickup.earliestAt).toBe('2026-06-27T11:00:00.000Z'); // 14:00 Sofia
    });
  });

  describe('regional 1 (same-day before cutoff)', () => {
    it('delivers today when ordered before 11:00', () => {
      const result = service.projectWarehouse(Warehouse.REGIONAL_1, THU_1012);

      expect(result.orderCutoffTime).toBe('11:00');
      expect(result.pickup.granularity).toBe('DAY');
      expect(deliveryDay(result.pickup.earliestAt)).toBe('2026-06-25'); // today
      // 11:00 Sofia cut-off as an absolute instant (08:00Z summer).
      expect(result.cutoffAt).toBe('2026-06-25T08:00:00.000Z');
    });

    it('slips to the next working day when ordered at/after 11:00', () => {
      const result = service.projectWarehouse(Warehouse.REGIONAL_1, THU_1130);

      expect(deliveryDay(result.pickup.earliestAt)).toBe('2026-06-26'); // Fri
    });
  });

  describe('regional 2 (next day) honours the 17:00 processing cutoff', () => {
    it('delivers next working day when ordered before 17:00', () => {
      const result = service.projectWarehouse(Warehouse.REGIONAL_2, THU_1600);

      expect(result.deliveryWorkDays).toBe(1);
      expect(result.orderCutoffTime).toBe('17:00');
      expect(deliveryDay(result.pickup.earliestAt)).toBe('2026-06-26'); // Fri
    });

    it('slips one extra working day when ordered after 17:00', () => {
      const result = service.projectWarehouse(Warehouse.REGIONAL_2, THU_1730);

      // Missed 17:00 -> dispatch Fri -> +1 working day -> Sat (shop open).
      expect(deliveryDay(result.pickup.earliestAt)).toBe('2026-06-27'); // Sat
    });
  });

  describe('multi-day warehouses count shop-open days', () => {
    it('Romania = +2 working days, skipping Sunday', () => {
      const result = service.projectWarehouse(Warehouse.ROMANIA, THU_1600);
      // Thu +2 open days -> Fri (1) -> Sat (2).
      expect(deliveryDay(result.pickup.earliestAt)).toBe('2026-06-27');
    });

    it('Poland = +3 working days, skipping Sunday', () => {
      const result = service.projectWarehouse(Warehouse.POLAND, THU_1600);
      // Thu +3 open days -> Fri, Sat, Mon.
      expect(deliveryDay(result.pickup.earliestAt)).toBe('2026-06-29');
    });
  });

  describe('courier overlay', () => {
    it('adds one working day to the pickup date as a DAY projection', () => {
      const result = service.projectWarehouse(Warehouse.REGIONAL_2, THU_1600);

      expect(result.courier.granularity).toBe('DAY');
      // Pickup Fri 26 + 1 working day = Sat 27.
      expect(deliveryDay(result.courier.earliestAt)).toBe('2026-06-27');
    });

    it('demotes a within-hour central pickup to a next-working-day courier', () => {
      const result = service.projectWarehouse(Warehouse.CENTRAL, THU_1012);

      expect(result.pickup.granularity).toBe('HOUR');
      expect(result.courier.granularity).toBe('DAY');
      expect(deliveryDay(result.courier.earliestAt)).toBe('2026-06-26'); // Fri
    });
  });

  describe('closed days roll to the next open day', () => {
    it('treats Sunday as closed and projects Monday', () => {
      const result = service.projectWarehouse(Warehouse.CENTRAL, SUN_1000);
      expect(deliveryDay(result.pickup.earliestAt)).toBe('2026-06-29'); // Mon
    });

    it('treats a Bulgarian public holiday as closed (03 March)', () => {
      // 08:00Z = 10:00 Sofia (winter, UTC+2) on Liberation Day (Tue).
      const onHoliday = new Date('2026-03-03T08:00:00Z');
      const result = service.projectWarehouse(Warehouse.CENTRAL, onHoliday);
      expect(deliveryDay(result.pickup.earliestAt)).toBe('2026-03-04'); // Wed
    });
  });

  it('honours a configurable same-day cutoff', () => {
    const earlyCutoff = makeService({ SAME_DAY_CUTOFF_HOUR: 9 });
    // 10:12 is now after a 09:00 cutoff -> regional 1 slips to next day.
    const result = earlyCutoff.projectWarehouse(Warehouse.REGIONAL_1, THU_1012);
    expect(deliveryDay(result.pickup.earliestAt)).toBe('2026-06-26');
  });
});
