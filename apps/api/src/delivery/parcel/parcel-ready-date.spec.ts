import type {
  ArticleInventoryDetailDto,
  WarehouseAvailabilityDto,
  WarehouseId,
} from '@vp-parts-shop/shared';
import type { AvailabilityByArticle } from '../../inventory';
import { parcelReadyDate, ReadyDateLine } from './parcel-ready-date';

function warehouse(
  warehouseId: WarehouseId,
  quantity: number,
  pickupAt: string,
): WarehouseAvailabilityDto {
  return {
    warehouseId,
    quantity,
    deliveryWorkDays: 0,
    orderCutoffTime: '17:00',
    cutoffAt: '2026-09-28T14:00:00Z',
    pickup: { earliestAt: pickupAt, granularity: 'DAY' },
    courier: { earliestAt: pickupAt, granularity: 'DAY' },
  };
}

function detail(
  ...availabilityByWarehouse: WarehouseAvailabilityDto[]
): ArticleInventoryDetailDto {
  return {
    available: availabilityByWarehouse.length > 0,
    bestPriceExVat: 10,
    bestPriceIncVat: 12,
    availabilityByWarehouse,
    computedAt: '2026-09-28T07:00:00Z',
  };
}

function line(articleNumber: string, quantity = 1): ReadyDateLine {
  return { article: { brandId: '30', articleNumber }, quantity };
}

const MONDAY = '2026-09-28T07:00:00Z';
const TUESDAY = '2026-09-29T06:00:00Z';
const THURSDAY = '2026-10-01T06:00:00Z';

describe('parcelReadyDate', () => {
  let availability: AvailabilityByArticle;

  beforeEach(() => {
    availability = new Map([
      ['30:FILTER', detail(warehouse('CENTRAL', 5, MONDAY))],
      [
        '30:PAD',
        detail(
          warehouse('CENTRAL', 1, MONDAY),
          warehouse('REGIONAL_2', 4, TUESDAY),
        ),
      ],
      ['30:DISC', detail(warehouse('POLAND', 2, THURSDAY))],
      ['30:GONE', detail()],
    ]);
  });

  it('is the day the only line is ready at the shop', () => {
    expect(parcelReadyDate([line('FILTER')], availability)).toBe('2026-09-28');
  });

  it('waits for the slowest line, since the parcel leaves in one piece', () => {
    expect(parcelReadyDate([line('FILTER'), line('DISC')], availability)).toBe(
      '2026-10-01',
    );
  });

  it('dates a line by the warehouse its quantity has to reach', () => {
    expect(parcelReadyDate([line('PAD', 1)], availability)).toBe('2026-09-28');
    expect(parcelReadyDate([line('PAD', 3)], availability)).toBe('2026-09-29');
  });

  it('has no date when a line holds more than the stock', () => {
    expect(parcelReadyDate([line('PAD', 6)], availability)).toBeNull();
  });

  it('has no date when a line is out of stock', () => {
    expect(
      parcelReadyDate([line('FILTER'), line('GONE')], availability),
    ).toBeNull();
  });

  it('has no date when the read did not answer for a line', () => {
    expect(parcelReadyDate([line('UNKNOWN')], availability)).toBeNull();
  });
});
