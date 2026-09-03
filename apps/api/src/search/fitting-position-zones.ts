import { FittingPositionZone } from '@vp-parts-shop/shared';
import { FITTING_POSITION_CRITERIA_ID } from './search-types';

/**
 * Where each fitting-position value sits on a top-down car.
 *
 * The keys are `keyId`s of TecDoc **key table 90**, which criterion 100 names
 * in its own `keyTableNum` and which `getKeyValues({ keyTableId: 90 })` serves
 * in full — 804 entries, and 188 of the 189 values seen live across 33 product
 * types are in it with the label the facet reports. That the codes are stable
 * ids rather than text is the only reason a diagram is possible.
 *
 * **Never derive a zone from the label.** They are localised and inflected:
 * `VR` reads "на предната ос отдясно", so matching on "предна ос" misses it on
 * the Bulgarian definite article alone — which is how a first attempt at this
 * map lost the two busiest wheel positions.
 *
 * Each alphabetic entry was checked against its table-90 label, and the numeric
 * ones were accepted only on a strict `N. <axle> [side]` shape so a substring
 * match could not drag in a body panel — "предница на автомобила" is the front
 * of the *shell*, not the front axle. Note 396 and 400 are filed under one
 * label, "1. заден мост отдясно", where the run of numbers implies 400 is the
 * second axle; both are rear-right either way, so the ambiguity cannot reach us.
 */
const ZONE_BY_CODE: Readonly<Record<string, FittingPositionZone | undefined>> =
  {
    VA: 'front-axle',
    V: 'front-axle',
    VG: 'front-axle',
    '385': 'front-axle',
    '386': 'front-axle',
    '389': 'front-axle',
    '390': 'front-axle',

    VL: 'front-left',
    LV: 'front-left',
    '387': 'front-left',
    '391': 'front-left',

    VR: 'front-right',
    RV: 'front-right',
    '388': 'front-right',
    '392': 'front-right',

    HA: 'rear-axle',
    H: 'rear-axle',
    HG: 'rear-axle',
    '393': 'rear-axle',
    '394': 'rear-axle',
    '397': 'rear-axle',
    '398': 'rear-axle',

    HL: 'rear-left',
    LH: 'rear-left',
    '395': 'rear-left',
    '399': 'rear-left',

    HR: 'rear-right',
    RH: 'rear-right',
    '396': 'rear-right',
    '400': 'rear-right',

    L: 'left',
    R: 'right',
  };

/**
 * The zone a facet value stands for, or null when a car outline cannot hold it.
 *
 * Null is the common answer and not a failure: criterion 100 is a grab-bag that
 * also files cylinder positions ("за цилиндър 1-4"), body locations ("B-колона",
 * "багажно пространство"), and orientations that are relative rather than
 * absolute ("двустранен", "пред оста", "от страната на трансмисията"). The 32
 * codes mapped here are 84% of measured usage — 1,236,807 of 1,464,928
 * occurrences — leaving the other 158 codes and 16% for the plain list the
 * client keeps alongside the diagram. Half of that remainder is a single axis
 * the plan view has no room for: `U` отдолу, `O` горе, `A` отвън and
 * `I` вътрешен are 105,265 occurrences between them.
 *
 * A merged value must agree with itself: every raw spelling has to resolve to
 * the same zone, or the answer is null. Two codes only merge when they share a
 * label, so a disagreement would mean the map contradicts table 90 rather than
 * that the visitor picked something ambiguous.
 */
export function fittingPositionZoneFor(
  criteriaId: string,
  rawValues: readonly string[],
): FittingPositionZone | null {
  if (criteriaId !== FITTING_POSITION_CRITERIA_ID) {
    return null;
  }

  const [first, ...rest] = rawValues.map((rawValue) => ZONE_BY_CODE[rawValue]);

  if (first === undefined) {
    return null;
  }

  return rest.every((zone) => zone === first) ? first : null;
}
