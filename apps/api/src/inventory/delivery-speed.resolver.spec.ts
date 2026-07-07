import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeliveryRule, rankForRule } from './delivery';
import { DeliverySpeedResolver } from './delivery-speed.resolver';

const BEFORE_CUTOFF = new Date('2026-06-25T05:00:00Z'); // 08:00 Sofia
const AFTER_CUTOFF = new Date('2026-06-25T12:00:00Z'); // 15:00 Sofia

function makeResolver(
  overrides: Record<string, unknown> = {},
): DeliverySpeedResolver {
  const config = {
    get: <T>(key: string): T => overrides[key] as T,
  } as unknown as ConfigService;
  return new DeliverySpeedResolver(config);
}

describe('DeliverySpeedResolver', () => {
  let resolver: DeliverySpeedResolver;

  beforeEach(() => {
    resolver = makeResolver();
  });

  it('resolves a within-hour warehouse', () => {
    const resolution = resolver.resolve('INTERCARS', 'B24', AFTER_CUTOFF);
    expect(resolution?.outcome.rank).toBe(
      rankForRule(DeliveryRule.WITHIN_HOUR),
    );
    expect(resolution?.rule).toBe(DeliveryRule.WITHIN_HOUR);
  });

  it('applies the same-day cut-off for cut-off warehouses but keeps the inherent rule', () => {
    const before = resolver.resolve('INTERCARS', 'B01', BEFORE_CUTOFF);
    expect(before?.outcome.rank).toBe(
      rankForRule(DeliveryRule.SAME_DAY_BEFORE_CUTOFF),
    );
    expect(before?.rule).toBe(DeliveryRule.SAME_DAY_BEFORE_CUTOFF);

    const after = resolver.resolve('INTERCARS', 'B01', AFTER_CUTOFF);
    // The clock-resolved outcome slips to the next-day rank...
    expect(after?.outcome.rank).toBe(rankForRule(DeliveryRule.NEXT_DAY));
    // ...but the inherent rule stays same-day (for the static warehouse group).
    expect(after?.rule).toBe(DeliveryRule.SAME_DAY_BEFORE_CUTOFF);
  });

  it('resolves fixed multi-day warehouses', () => {
    expect(
      resolver.resolve('AUTO1', 'REGIONAL', BEFORE_CUTOFF)?.outcome.rank,
    ).toBe(rankForRule(DeliveryRule.TWO_BUSINESS_DAYS));
    expect(
      resolver.resolve('INTERCARS', 'HSN', BEFORE_CUTOFF)?.outcome.rank,
    ).toBe(rankForRule(DeliveryRule.THREE_BUSINESS_DAYS));
  });

  it('honours the configured same-day cut-off (shared with the schedule service)', () => {
    // With a 09:00 cut-off, an 08:00 order still makes the same day...
    const earlyCutoff = makeResolver({ SAME_DAY_CUTOFF_HOUR: 9 });
    expect(
      earlyCutoff.resolve('INTERCARS', 'B01', BEFORE_CUTOFF)?.outcome.rank,
    ).toBe(rankForRule(DeliveryRule.SAME_DAY_BEFORE_CUTOFF));

    // ...but a 10:00 order now misses it and slips to the next day, whereas the
    // hardcoded 11:00 default would still have called it same-day.
    const TEN_AM = new Date('2026-06-25T07:00:00Z'); // 10:00 Sofia
    expect(earlyCutoff.resolve('INTERCARS', 'B01', TEN_AM)?.outcome.rank).toBe(
      rankForRule(DeliveryRule.NEXT_DAY),
    );
  });

  it('returns null and raises an alert for an unknown supplier/warehouse', () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    expect(resolver.resolve('MYSTERY', 'XYZ', BEFORE_CUTOFF)).toBeNull();
    expect(resolver.resolve('INTERCARS', 'NOPE', BEFORE_CUTOFF)).toBeNull();
    expect(resolver.resolve('INTERCARS', null, BEFORE_CUTOFF)).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(3);

    errorSpy.mockRestore();
  });
});
