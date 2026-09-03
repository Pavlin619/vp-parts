import { fittingPositionZoneFor } from './fitting-position-zones';
import { AXLE_CRITERIA_ID, FITTING_POSITION_CRITERIA_ID } from './search-types';

const zoneFor = (rawValues: string[]) =>
  fittingPositionZoneFor(FITTING_POSITION_CRITERIA_ID, rawValues);

describe('fittingPositionZoneFor', () => {
  describe('the codes each zone is built from', () => {
    // Every pair here was read off TecDoc key table 90 via
    // `getKeyValues({ keyTableId: 90 })`, with the label quoted beside it.
    it.each([
      ['VA', 'front-axle', 'предна ос'],
      ['V', 'front-axle', 'отпред'],
      ['VG', 'front-axle', 'от двете страни на предната ос'],
      ['385', 'front-axle', '1. преден мост'],
      ['VL', 'front-left', 'на предната ос отляво'],
      ['LV', 'front-left', 'отпред отляво'],
      ['387', 'front-left', '1. преден мост отляво'],
      ['VR', 'front-right', 'на предната ос отдясно'],
      ['RV', 'front-right', 'отпред отдясно'],
      ['HA', 'rear-axle', 'задна ос'],
      ['H', 'rear-axle', 'отзад'],
      ['393', 'rear-axle', '1. заден мост'],
      ['HL', 'rear-left', 'на задната ос отляво'],
      ['LH', 'rear-left', 'отзад ляво'],
      ['HR', 'rear-right', 'на задната ос отдясно'],
      ['RH', 'rear-right', 'отзад дясно'],
      ['396', 'rear-right', '1. заден мост отдясно'],
      ['400', 'rear-right', '1. заден мост отдясно'],
      ['L', 'left', 'ляво'],
      ['R', 'right', 'дясно'],
    ])('places %s in %s (%s)', (code, zone) => {
      expect(zoneFor([code])).toBe(zone);
    });

    // The synonym pairs are the whole reason a zone maps to a set of codes: a
    // zone sending only the busier spelling would silently drop the articles
    // filed under the other.
    it.each([
      ['front-left', 'VL', 'LV'],
      ['front-right', 'VR', 'RV'],
      ['rear-left', 'HL', 'LH'],
      ['rear-right', 'HR', 'RH'],
    ])('resolves both spellings of %s', (zone, busier, rarer) => {
      expect(zoneFor([busier])).toBe(zone);
      expect(zoneFor([rarer])).toBe(zone);
    });

    it('keeps the sideless axle values apart from the sideless side ones', () => {
      // TecDoc files "отпред" with no side and "ляво" with no axle, so neither
      // can be resolved onto a wheel without inventing the missing half.
      expect(zoneFor(['V'])).toBe('front-axle');
      expect(zoneFor(['L'])).toBe('left');
    });
  });

  describe('what a car outline cannot hold', () => {
    it.each([
      ['U', 'отдолу — a level, not a place on the plan'],
      ['FB', 'двустранен'],
      ['VD', 'пред оста — relative to the axle, not the front of the car'],
      ['HD', 'зад моста'],
      ['RS', 'от страната на колелото'],
      ['GS', 'от страната на трансмисията'],
      ['307', 'за цилиндър 1-4'],
      ['56', 'B-колона'],
      ['F', 'предница на автомобила — the shell, not the axle'],
    ])('answers null for %s (%s)', (code) => {
      expect(zoneFor([code])).toBeNull();
    });

    it('answers null for a code that is not in key table 90 at all', () => {
      expect(zoneFor(['NOT-A-CODE'])).toBeNull();
    });

    it('answers null when no value was offered', () => {
      expect(zoneFor([])).toBeNull();
    });
  });

  describe('a merged value', () => {
    it('takes the zone its spellings agree on', () => {
      expect(zoneFor(['396', '400'])).toBe('rear-right');
    });

    it('refuses a zone when two spellings disagree', () => {
      expect(zoneFor(['VL', 'HR'])).toBeNull();
    });

    it('refuses a zone when one spelling is unplaceable', () => {
      expect(zoneFor(['VL', 'U'])).toBeNull();
    });
  });

  describe('other criteria', () => {
    it('places nothing for the axle criterion, whose codes are its own', () => {
      // Criterion 273 files plain axle numbers ('79', '19'), which share the
      // numeric space of table 90 without sharing its meaning.
      expect(fittingPositionZoneFor(AXLE_CRITERIA_ID, ['385'])).toBeNull();
    });

    it('places nothing for an arbitrary dimension criterion', () => {
      expect(fittingPositionZoneFor('467', ['VL'])).toBeNull();
    });
  });
});
