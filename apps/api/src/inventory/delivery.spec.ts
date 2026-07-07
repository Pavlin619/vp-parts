import {
  DeliveryRule,
  OWN_STOCK_RANK,
  lookupDeliveryRule,
  ownStockOutcome,
  rankForRule,
  resolveDeliveryRule,
} from './delivery';

// 2026-06-25 is a Thursday. 08:00 UTC == 11:00 Europe/Sofia (UTC+3 in summer),
// so it is the boundary used to exercise the same-day cut-off.
const BEFORE_CUTOFF = new Date('2026-06-25T05:00:00Z'); // 08:00 Sofia
const AFTER_CUTOFF = new Date('2026-06-25T12:00:00Z'); // 15:00 Sofia

describe('delivery domain', () => {
  describe('lookupDeliveryRule', () => {
    it('maps known Intercars warehouses', () => {
      expect(lookupDeliveryRule('INTERCARS', 'B24')).toBe(
        DeliveryRule.WITHIN_HOUR,
      );
      expect(lookupDeliveryRule('INTERCARS', 'B01')).toBe(
        DeliveryRule.SAME_DAY_BEFORE_CUTOFF,
      );
      expect(lookupDeliveryRule('INTERCARS', 'HZA')).toBe(
        DeliveryRule.TWO_BUSINESS_DAYS,
      );
      expect(lookupDeliveryRule('INTERCARS', 'HSN')).toBe(
        DeliveryRule.THREE_BUSINESS_DAYS,
      );
    });

    it('maps known AutoPlus warehouses', () => {
      expect(lookupDeliveryRule('AUTOPLUS', 'MAGAZIN_PLEVEN')).toBe(
        DeliveryRule.WITHIN_HOUR,
      );
      expect(lookupDeliveryRule('AUTOPLUS', 'CENTRALEN_SKLAD')).toBe(
        DeliveryRule.SAME_DAY_BEFORE_CUTOFF,
      );
    });

    it('maps AutoKomers and Auto1 warehouses', () => {
      expect(lookupDeliveryRule('AUTOKOMERS', 'CENTRAL')).toBe(
        DeliveryRule.NEXT_DAY,
      );
      expect(lookupDeliveryRule('AUTO1', 'CENTRAL')).toBe(
        DeliveryRule.NEXT_DAY,
      );
      expect(lookupDeliveryRule('AUTO1', 'REGIONAL')).toBe(
        DeliveryRule.TWO_BUSINESS_DAYS,
      );
    });

    it('is case-insensitive on the supplier source', () => {
      expect(lookupDeliveryRule('intercars', 'B24')).toBe(
        DeliveryRule.WITHIN_HOUR,
      );
    });

    it('returns null for unknown supplier or warehouse', () => {
      expect(lookupDeliveryRule('UNKNOWN', 'B24')).toBeNull();
      expect(lookupDeliveryRule('INTERCARS', 'NOPE')).toBeNull();
      expect(lookupDeliveryRule('INTERCARS', null)).toBeNull();
    });
  });

  describe('resolveDeliveryRule', () => {
    it('resolves within-hour and fixed-day rules independent of the clock', () => {
      expect(
        resolveDeliveryRule(DeliveryRule.WITHIN_HOUR, AFTER_CUTOFF),
      ).toEqual({ rank: rankForRule(DeliveryRule.WITHIN_HOUR) });
      expect(resolveDeliveryRule(DeliveryRule.NEXT_DAY, AFTER_CUTOFF)).toEqual({
        rank: rankForRule(DeliveryRule.NEXT_DAY),
      });
      expect(
        resolveDeliveryRule(DeliveryRule.TWO_BUSINESS_DAYS, BEFORE_CUTOFF).rank,
      ).toBe(rankForRule(DeliveryRule.TWO_BUSINESS_DAYS));
      expect(
        resolveDeliveryRule(DeliveryRule.THREE_BUSINESS_DAYS, BEFORE_CUTOFF)
          .rank,
      ).toBe(rankForRule(DeliveryRule.THREE_BUSINESS_DAYS));
    });

    it('delivers same day before the cut-off (Europe/Sofia)', () => {
      const outcome = resolveDeliveryRule(
        DeliveryRule.SAME_DAY_BEFORE_CUTOFF,
        BEFORE_CUTOFF,
      );
      expect(outcome.rank).toBe(
        rankForRule(DeliveryRule.SAME_DAY_BEFORE_CUTOFF),
      );
    });

    it('falls back to next day at/after the cut-off (Europe/Sofia)', () => {
      const outcome = resolveDeliveryRule(
        DeliveryRule.SAME_DAY_BEFORE_CUTOFF,
        AFTER_CUTOFF,
      );
      // After the cut-off same-day stock slips to the next-day rank.
      expect(outcome.rank).toBe(rankForRule(DeliveryRule.NEXT_DAY));
    });
  });

  describe('ranking', () => {
    it('orders our own stock fastest and slower rules progressively later', () => {
      expect(ownStockOutcome().rank).toBe(OWN_STOCK_RANK);
      expect(rankForRule(DeliveryRule.WITHIN_HOUR)).toBeGreaterThan(
        OWN_STOCK_RANK,
      );
      expect(rankForRule(DeliveryRule.THREE_BUSINESS_DAYS)).toBeGreaterThan(
        rankForRule(DeliveryRule.SAME_DAY_BEFORE_CUTOFF),
      );
    });
  });
});
