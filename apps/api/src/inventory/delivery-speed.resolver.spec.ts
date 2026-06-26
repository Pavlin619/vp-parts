import { Logger } from '@nestjs/common';
import { StockStatus } from '@vp-parts-shop/shared';
import { DeliverySpeedResolver } from './delivery-speed.resolver';

const BEFORE_CUTOFF = new Date('2026-06-25T05:00:00Z'); // 08:00 Sofia
const AFTER_CUTOFF = new Date('2026-06-25T12:00:00Z'); // 15:00 Sofia

describe('DeliverySpeedResolver', () => {
  let resolver: DeliverySpeedResolver;

  beforeEach(() => {
    resolver = new DeliverySpeedResolver();
  });

  it('resolves a within-hour warehouse', () => {
    expect(resolver.resolve('INTERCARS', 'B24', AFTER_CUTOFF)?.status).toBe(
      StockStatus.DELIVERY_WITHIN_HOUR,
    );
  });

  it('applies the same-day cut-off for cut-off warehouses', () => {
    expect(resolver.resolve('INTERCARS', 'B01', BEFORE_CUTOFF)?.status).toBe(
      StockStatus.DELIVERY_SAME_DAY,
    );
    expect(resolver.resolve('INTERCARS', 'B01', AFTER_CUTOFF)?.status).toBe(
      StockStatus.DELIVERY_NEXT_DAY,
    );
  });

  it('resolves fixed multi-day warehouses', () => {
    expect(resolver.resolve('AUTO1', 'REGIONAL', BEFORE_CUTOFF)?.status).toBe(
      StockStatus.DELIVERY_IN_2_DAYS,
    );
    expect(resolver.resolve('INTERCARS', 'HSN', BEFORE_CUTOFF)?.status).toBe(
      StockStatus.DELIVERY_IN_3_DAYS,
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
