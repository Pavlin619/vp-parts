import {
  AttributeFacetDto,
  AttributeFacetValueDto,
} from '@vp-parts-shop/shared';
import { fittingPositionZoneFor } from './fitting-position-zones';
import { attributeRoleFor, CriteriaFilter } from './search-types';

/**
 * TecDoc `CriteriaInfo`: the criterion a criteria facet block describes.
 * `criteriaUnitDescription` is the only part of it we read that the schema
 * marks optional; `isMandatory` and `isInterval` are both required.
 */
export interface TecDocCriteriaInfo {
  criteriaId: number;
  criteriaDescription: string;
  criteriaUnitDescription?: string;
  criteriaType: string;
  isMandatory: boolean;
  isInterval: boolean;
}

/**
 * TecDoc `CriteriaValueCounts`: one selectable value of a criterion, with the
 * machine `rawValue` a `criteriaFilters` selection echoes back and the display
 * `formattedValue`.
 *
 * `permittedKeyValue` is TecDoc's DQM verdict on the value: "for criteriaType
 * 'K', defines whether this value is permitted for a given genericArticle and
 * criteria. Available when filtering by a single genericArticleId and
 * 'applyDqmRules' … is set to true." So the request flag does not drop the
 * impermissible values — it only marks them, and the caller does the dropping.
 * Absent for every criterion that is not a key table, and whenever the flag was
 * not sent.
 */
export interface TecDocCriteriaValueCount {
  rawValue: string;
  formattedValue: string;
  permittedKeyValue?: boolean;
  count: number;
}

/**
 * One technical-attribute facet block from a `getArticles`
 * `includeCriteriaFacets` response (TecDoc `CriteriaFacetCount`): the criterion
 * nested under `criteria`, its values under `criteriaValueCounts`.
 */
export interface TecDocCriteriaFacetCount {
  criteria: TecDocCriteriaInfo;
  criteriaValueCounts?: TecDocCriteriaValueCount[];
}

/** A numeric measurement — a dimension proper, and a scale to order. */
const NUMERIC_CRITERIA_TYPE = 'N';

/** A key table — a closed enumeration TecDoc maintains, and the DQM axis. */
const KEY_TABLE_CRITERIA_TYPE = 'K';

/**
 * The criteria types worth offering as a filter. An allow-list rather than a
 * deny-list because an unrecognised type is exactly the case we cannot render:
 * we would be shipping a value list without knowing whether it enumerates
 * anything.
 *
 * Type `A` is free text a data supplier typed, and is not a filter however it
 * is presented — one product type carried 3,620 such values across 13 criteria,
 * among them "за OE-номер" with 2,216 of them and thread sizes filed as
 * `M20x1.5-6H`, `7`, `X` and `0`. Type `V` is a placeholder: every one measured
 * held the single value "Данни за автомобила", an instruction to consult
 * vehicle data.
 *
 * Type `D` is a date, and it is dropped for a different reason. It appears only
 * under a linkage — criteria `20` and `21`, "година на производство от/до",
 * `isInterval: true`, filed as `YYYYMM` and rendered `MM.YYYY` — so it is the
 * build-date window a part is restricted to. It is a genuine fact about the
 * article, but it is not a filter: it surfaces only once TecDoc has already
 * matched the vehicle, which is the same restriction applied properly, and a
 * one- or two-value date range offered beside the dimensions reads as a control
 * that narrows nothing. It belongs on the article, not in the sidebar.
 */
const OFFERABLE_CRITERIA_TYPES: ReadonlySet<string> = new Set([
  NUMERIC_CRITERIA_TYPE,
  KEY_TABLE_CRITERIA_TYPE,
]);

export function isOfferableCriterion(criteriaType: string): boolean {
  return OFFERABLE_CRITERIA_TYPES.has(criteriaType);
}

/**
 * How many values one criterion may offer. TecDoc caps nothing here and a
 * numeric criterion runs to thousands — `височина [mm]` measured 1,632 values
 * on a single product type — which made the criteria block 95% of the
 * enumeration response (38 KB without it, 796 KB with) and as much again on the
 * wire.
 *
 * Sixty is where the tail stops paying for itself: the 60 most-matched heights
 * of those 1,632 still cover 64% of the matches, and beyond it the values are
 * near-unique — 29% of all measured values matched exactly one article.
 *
 * A capped list of points is the control, and a min/max range was considered
 * and rejected on three measured grounds. **TecDoc cannot filter by range at
 * all**: `CriteriaFilter` is `{ criteriaId, rawValue }` and nothing else, so a
 * range could only be expanded into the discrete values inside it — which needs
 * every value, and `includeCriteriaFacets` is a plain boolean with no way to
 * ask for one criterion and no limit parameter, so the full set always costs the
 * entire criteria block (837 KB on air filters, 1,357 KB on brake discs).
 * Caching the numeric-value-to-raw-spelling map needed to expand a selection
 * adds 80–155 KB per entry on top of the 109–131 KB we serve, and the
 * alternative is a second call on every filtered search. Finally the values
 * carry outliers that would make a slider lie: `височина` runs to 51,916 mm and
 * `центриращ диаметър` to 92,036 mm, so a true min/max span is unusable without
 * percentile trimming — another judgement call on top.
 */
export const DIMENSION_VALUE_LIMIT = 60;

/**
 * Joins the raw spellings of one merged value into the single opaque token that
 * travels in `?attr=`.
 *
 * Safe as a separator because no value we merge can contain it: a merge happens
 * on a numeric measurement or on two key-table entries, and `|` appeared in
 * none of 40,698 raw and formatted values measured across four product types.
 */
export const MERGED_VALUE_SEPARATOR = '|';

/**
 * One selectable value, after the spellings a visitor cannot tell apart have
 * been folded together. `numericValue` is null for anything that is not a
 * measurement, which is also what puts it off the scale when ordering.
 */
interface MergedValue {
  rawValues: string[];
  label: string;
  labelCount: number;
  count: number;
  numericValue: number | null;
}

/**
 * Turns the raw TecDoc `criteriaFacets` blocks into the shared attribute facet
 * groups: one group per criterion, keyed by its `criteriaId` and carrying the
 * unit and type so the client can render a measurement differently from an
 * enumeration.
 *
 * Four things happen to the values on the way, none of which TecDoc will do for
 * us — `includeCriteriaFacetsSorting`, its own recommended ordering, is refused
 * on our account with "Sorting of criteria facets is not enabled":
 *
 * 1. Values DQM ruled out are dropped, and criteria left with none go too.
 * 2. Spellings of one value are merged — see {@link mergeIndistinguishableValues}.
 * 3. The list is capped at {@link DIMENSION_VALUE_LIMIT}, keeping the selection.
 * 4. What survives is ordered: measurements up the scale, enumerations by count.
 *
 * `selected` is what the visitor has already applied, so a value the cap would
 * otherwise drop stays visible; matching is by raw spelling, since a link built
 * before a value was merged carries only one half of its token.
 */
export function mapAttributeFacets(
  criteriaCounts: TecDocCriteriaFacetCount[] = [],
  selected: CriteriaFilter[] = [],
): AttributeFacetDto[] {
  return criteriaCounts
    .filter(({ criteria }) => isOfferableCriterion(criteria.criteriaType))
    .map((count) =>
      mapCriterion(count, selectedRawValuesFor(selected, count.criteria)),
    )
    .filter((facet) => facet.values.length > 0);
}

/**
 * Splits an `?attr=` value back into every raw spelling it stands for, so one
 * selected pill becomes one `criteriaFilters` entry per spelling.
 *
 * This is why a merged value works at all, and it rests on the same property as
 * the multi-select: TecDoc OR-combines two filters sharing a `criteriaId`,
 * measured and recorded on {@link CriteriaFilter}. Selecting the merged `193`
 * sends both `193` and `193,0` and matches 370 articles — the 358 and the 12.
 */
export function splitMergedValue(value: string): string[] {
  return value
    .split(MERGED_VALUE_SEPARATOR)
    .filter((rawValue) => rawValue.length > 0);
}

function mapCriterion(
  { criteria, criteriaValueCounts }: TecDocCriteriaFacetCount,
  selectedRawValues: ReadonlySet<string>,
): AttributeFacetDto {
  const permitted = (criteriaValueCounts ?? []).filter(isPermittedValue);
  const merged = mergeIndistinguishableValues(permitted, criteria.criteriaType);
  const offered = capValues(merged, selectedRawValues);
  const id = String(criteria.criteriaId);

  return {
    id,
    label: criteria.criteriaDescription,
    unit: criteria.criteriaUnitDescription ?? null,
    type: criteria.criteriaType,
    isInterval: criteria.isInterval,
    isMandatory: criteria.isMandatory,
    role: attributeRoleFor(id),
    values: orderValues(offered, criteria.criteriaType).map((merged) =>
      toFacetValue(merged, id),
    ),
  };
}

/**
 * Only an explicit `false` is a rejection. TecDoc omits the flag for every
 * criterion that is not a key table and whenever `applyDqmRules` was not sent,
 * so treating absence as "not permitted" would empty the dimension list for
 * every search that does not narrow to one product type.
 */
function isPermittedValue(value: TecDocCriteriaValueCount): boolean {
  return value.permittedKeyValue !== false;
}

/**
 * Folds together the values a visitor has no way to distinguish, summing their
 * counts and keeping every raw spelling so the filter still selects all of them.
 *
 * TecDoc files one measurement under several spellings: `ширина [mm]` offered
 * `193` matching 358 articles beside an identical-looking `193` filed as
 * `193,0` matching 12, and 17 of 18 numeric criteria on one product type were
 * affected. Left alone, half the pills in a dimension list are decoys — picking
 * the wrong one narrows 89,270 articles to 12.
 *
 * A measurement merges on its numeric value, so `106.4` and `106,4` are one
 * value; anything else merges on the rendered label, which is what makes the
 * key-table pair `SA` / `S` (both "комплект") a single choice.
 */
function mergeIndistinguishableValues(
  values: TecDocCriteriaValueCount[],
  criteriaType: string,
): MergedValue[] {
  const byIdentity = new Map<string, MergedValue>();

  for (const value of values) {
    const numericValue = measurementOf(value.rawValue, criteriaType);
    const identity =
      numericValue !== null
        ? `measurement:${numericValue}`
        : `label:${value.formattedValue}`;
    const merged = byIdentity.get(identity);

    if (!merged) {
      byIdentity.set(identity, {
        rawValues: [value.rawValue],
        label: value.formattedValue,
        labelCount: value.count,
        count: value.count,
        numericValue,
      });
      continue;
    }

    merged.rawValues.push(value.rawValue);
    merged.count += value.count;

    // The spelling most articles are filed under is the one to show.
    if (value.count > merged.labelCount) {
      merged.label = value.formattedValue;
      merged.labelCount = value.count;
    }
  }

  return [...byIdentity.values()];
}

/**
 * The number a raw value measures, or null when it does not measure one.
 *
 * Only a numeric criterion is read as a scale: a key table filed as digits is
 * still a code, and folding two of its entries together because they parse to
 * the same number would merge two distinct choices. TecDoc writes decimals with
 * a comma in a Bulgarian response and with a point elsewhere in the same
 * response, so both are accepted.
 */
function measurementOf(rawValue: string, criteriaType: string): number | null {
  if (criteriaType !== NUMERIC_CRITERIA_TYPE) {
    return null;
  }

  const measurement = Number(rawValue.replace(',', '.'));

  return rawValue.trim().length > 0 && Number.isFinite(measurement)
    ? measurement
    : null;
}

/**
 * Keeps the {@link DIMENSION_VALUE_LIMIT} most-matched values, plus any the
 * visitor has selected.
 *
 * Capping by count and ordering for display are two different questions: this
 * one decides *which* values are worth offering, and {@link orderValues} then
 * decides what order to offer them in.
 */
function capValues(
  values: MergedValue[],
  selectedRawValues: ReadonlySet<string>,
): MergedValue[] {
  if (values.length <= DIMENSION_VALUE_LIMIT) {
    return values;
  }

  const byCount = [...values].sort((left, right) => right.count - left.count);
  const kept = byCount.slice(0, DIMENSION_VALUE_LIMIT);
  const dropped = byCount.slice(DIMENSION_VALUE_LIMIT);

  return [
    ...kept,
    ...dropped.filter((value) => isSelected(value, selectedRawValues)),
  ];
}

/**
 * The order the values are offered in.
 *
 * A measurement is a scale, so it reads as one — ascending, whatever the
 * counts, because a visitor looking for a 193 mm width scans for the number
 * rather than for the popular sizes. A key table has no inherent order, so the
 * most-matched value leads, which is also the order the cap keeps by.
 *
 * The label breaks every tie, so a set of equal counts cannot come back in two
 * different orders on two identical requests.
 */
function orderValues(
  values: MergedValue[],
  criteriaType: string,
): MergedValue[] {
  if (criteriaType === NUMERIC_CRITERIA_TYPE) {
    return [...values].sort(byMeasurement);
  }

  return [...values].sort(
    (left, right) => right.count - left.count || byLabel(left, right),
  );
}

/**
 * Up the scale, with everything that is not on it after the end — a numeric
 * criterion still holds the occasional unparseable value, and it has no
 * position among the numbers.
 */
function byMeasurement(left: MergedValue, right: MergedValue): number {
  if (left.numericValue === null || right.numericValue === null) {
    return (
      Number(left.numericValue === null) -
        Number(right.numericValue === null) || byLabel(left, right)
    );
  }

  return left.numericValue - right.numericValue || byLabel(left, right);
}

/**
 * A plain code-point comparison rather than a collator: this only ever breaks a
 * tie, and it has to give the same answer in every environment that serves or
 * caches the response.
 */
function byLabel(left: MergedValue, right: MergedValue): number {
  if (left.label === right.label) {
    return 0;
  }

  return left.label < right.label ? -1 : 1;
}

/**
 * `zone` is omitted rather than sent as null, because the criterion it applies
 * to is one of many: a null on every value of a capped dimension list costs
 * ~13 KB on the 1,028-value responses measured, for a field only the
 * fitting-position control reads.
 */
function toFacetValue(
  merged: MergedValue,
  criteriaId: string,
): AttributeFacetValueDto {
  const zone = fittingPositionZoneFor(criteriaId, merged.rawValues);

  return {
    // Sorted so one merged value is one token, whatever order TecDoc listed its
    // spellings in — the token is a URL, a cache key and the selected state.
    value: [...merged.rawValues].sort().join(MERGED_VALUE_SEPARATOR),
    label: merged.label,
    count: merged.count,
    ...(zone !== null && { zone }),
  };
}

function selectedRawValuesFor(
  selected: CriteriaFilter[],
  criteria: TecDocCriteriaInfo,
): ReadonlySet<string> {
  return new Set(
    selected
      .filter((filter) => filter.criteriaId === criteria.criteriaId)
      .map((filter) => filter.rawValue),
  );
}

function isSelected(
  value: MergedValue,
  selectedRawValues: ReadonlySet<string>,
): boolean {
  return value.rawValues.some((rawValue) => selectedRawValues.has(rawValue));
}
