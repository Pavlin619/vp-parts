import {
  DIMENSION_VALUE_LIMIT,
  isOfferableCriterion,
  mapAttributeFacets,
  MERGED_VALUE_SEPARATOR,
  splitMergedValue,
  TecDocCriteriaFacetCount,
  TecDocCriteriaInfo,
  TecDocCriteriaValueCount,
} from './dimension-facets';
import { FITTING_POSITION_CRITERIA_ID } from './search-types';

/**
 * A `criteriaFacets.counts` entry as TecDoc files it: the criterion nested
 * under `criteria`, its values under `criteriaValueCounts`.
 */
function criteriaFacet(
  criteria: Partial<TecDocCriteriaInfo> &
    Pick<TecDocCriteriaInfo, 'criteriaId'>,
  criteriaValueCounts: TecDocCriteriaValueCount[],
): TecDocCriteriaFacetCount {
  return {
    criteria: {
      criteriaDescription: `Criterion ${criteria.criteriaId}`,
      criteriaType: 'N',
      isInterval: false,
      isMandatory: false,
      ...criteria,
    },
    criteriaValueCounts,
  };
}

function numericValues(howMany: number): TecDocCriteriaValueCount[] {
  return Array.from({ length: howMany }, (_, index) => ({
    rawValue: String(index + 1),
    formattedValue: String(index + 1),
    count: index + 1,
  }));
}

describe('isOfferableCriterion', () => {
  it('offers numeric dimensions and key tables', () => {
    expect(isOfferableCriterion('N')).toBe(true);
    expect(isOfferableCriterion('K')).toBe(true);
  });

  // Type A is free text a data supplier typed: measured live on one product
  // type it carried 3,620 values across 13 criteria, among them "за OE-номер"
  // with 2,216 and thread sizes filed as "M20x1.5-6H", "7", "X" and "0".
  // Nothing there narrows a result set.
  it('does not offer free-text criteria', () => {
    expect(isOfferableCriterion('A')).toBe(false);
  });

  // Every type V criterion measured held exactly one value, the placeholder
  // "Данни за автомобила" — a note to consult vehicle data, not a filter.
  it('does not offer vehicle-data placeholders', () => {
    expect(isOfferableCriterion('V')).toBe(false);
  });

  it('does not offer a type it has never been told about', () => {
    expect(isOfferableCriterion('D')).toBe(false);
    expect(isOfferableCriterion('')).toBe(false);
  });
});

describe('mapAttributeFacets', () => {
  it('reads the criterion from `criteria` and its values from `criteriaValueCounts`', () => {
    const [facet] = mapAttributeFacets([
      criteriaFacet(
        {
          criteriaId: 20,
          criteriaDescription: 'Diameter',
          criteriaUnitDescription: 'mm',
          criteriaType: 'N',
          isInterval: true,
        },
        [{ rawValue: '106.4', formattedValue: '106,4', count: 3 }],
      ),
    ]);

    expect(facet).toEqual({
      id: '20',
      label: 'Diameter',
      unit: 'mm',
      type: 'N',
      isInterval: true,
      isMandatory: false,
      role: null,
      values: [{ value: '106.4', label: '106,4', count: 3 }],
    });
  });

  // The unit is the only part of TecDoc's CriteriaInfo the schema marks
  // optional, and a unitless criterion is the common case.
  it('nulls an absent unit', () => {
    const [facet] = mapAttributeFacets([
      criteriaFacet({ criteriaId: 20, criteriaType: 'K' }, [
        { rawValue: 'front', formattedValue: 'Front', count: 1 },
      ]),
    ]);

    expect(facet.unit).toBeNull();
  });

  it('carries the mandatory flag through', () => {
    const [mandatory, optional] = mapAttributeFacets([
      criteriaFacet({ criteriaId: 20, isMandatory: true }, [
        { rawValue: '106.4', formattedValue: '106,4', count: 3 },
      ]),
      criteriaFacet({ criteriaId: 21, criteriaType: 'K', isMandatory: false }, [
        { rawValue: 'steel', formattedValue: 'Стомана', count: 2 },
      ]),
    ]);

    expect(mandatory.isMandatory).toBe(true);
    expect(optional.isMandatory).toBe(false);
  });

  it('tags the fitting-position criterion with its semantic role', () => {
    const [facet] = mapAttributeFacets([
      criteriaFacet(
        {
          criteriaId: Number(FITTING_POSITION_CRITERIA_ID),
          criteriaDescription: 'Позиция на монтаж',
          criteriaType: 'K',
        },
        [{ rawValue: 'front', formattedValue: 'Отпред', count: 1 }],
      ),
    ]);

    expect(facet.role).toBe('fitting-position');
  });

  it('drops criteria that carry no values', () => {
    expect(mapAttributeFacets([criteriaFacet({ criteriaId: 20 }, [])])).toEqual(
      [],
    );
  });

  // `criteriaValueCounts` is minOccurs=0 in the schema, so a criterion with no
  // values arrives with the field missing rather than as an empty array.
  it('drops a criterion whose value block was omitted entirely', () => {
    expect(
      mapAttributeFacets([
        {
          criteria: {
            criteriaId: 20,
            criteriaDescription: 'Diameter',
            criteriaType: 'N',
            isInterval: false,
            isMandatory: true,
          },
        },
      ]),
    ).toEqual([]);
  });

  it('drops a criterion whose type is not offerable, values and all', () => {
    expect(
      mapAttributeFacets([
        criteriaFacet({ criteriaId: 48, criteriaType: 'A' }, [
          { rawValue: 'A 000 090 38 51', formattedValue: '…', count: 9 },
        ]),
      ]),
    ).toEqual([]);
  });

  describe('DQM verdicts', () => {
    it('drops a value TecDoc ruled impermissible', () => {
      const [facet] = mapAttributeFacets([
        criteriaFacet({ criteriaId: 44, criteriaType: 'K' }, [
          {
            rawValue: 'Отпред',
            formattedValue: 'Отпред',
            permittedKeyValue: true,
            count: 6,
          },
          {
            rawValue: 'Отзад',
            formattedValue: 'Отзад',
            permittedKeyValue: false,
            count: 2,
          },
        ]),
      ]);

      expect(facet.values).toEqual([
        { value: 'Отпред', label: 'Отпред', count: 6 },
      ]);
    });

    // The flag is absent for every non-key-table criterion and whenever
    // `applyDqmRules` was not sent, so absence cannot read as a rejection.
    it('keeps values that carry no verdict at all', () => {
      const [facet] = mapAttributeFacets([
        criteriaFacet({ criteriaId: 20 }, [
          { rawValue: '106.4', formattedValue: '106,4', count: 3 },
          { rawValue: '112.0', formattedValue: '112,0', count: 1 },
        ]),
      ]);

      expect(facet.values).toHaveLength(2);
    });

    it('drops the criterion when every value was ruled out', () => {
      expect(
        mapAttributeFacets([
          criteriaFacet({ criteriaId: 44, criteriaType: 'K' }, [
            {
              rawValue: 'Отзад',
              formattedValue: 'Отзад',
              permittedKeyValue: false,
              count: 2,
            },
          ]),
        ]),
      ).toEqual([]);
    });
  });

  /**
   * TecDoc files the same measurement under several raw spellings, so one
   * width arrives as more than one selectable value. Measured on "въздушен
   * филтър": 17 of 18 numeric criteria were affected, and `ширина [mm]` alone
   * offered 170 duplicated labels — `193` matching 358 articles next to an
   * identical-looking `193` matching 12.
   */
  describe('merging values the visitor cannot tell apart', () => {
    it('merges numeric values that differ only in their decimal spelling', () => {
      const [facet] = mapAttributeFacets([
        criteriaFacet({ criteriaId: 206, criteriaType: 'N' }, [
          { rawValue: '193', formattedValue: '193', count: 358 },
          { rawValue: '193,0', formattedValue: '193', count: 12 },
        ]),
      ]);

      expect(facet.values).toEqual([
        {
          value: `193${MERGED_VALUE_SEPARATOR}193,0`,
          label: '193',
          count: 370,
        },
      ]);
    });

    it('treats a comma and a point decimal as the same number', () => {
      const [facet] = mapAttributeFacets([
        criteriaFacet({ criteriaId: 206, criteriaType: 'N' }, [
          { rawValue: '106.4', formattedValue: '106,4', count: 2 },
          { rawValue: '106,4', formattedValue: '106,4', count: 5 },
        ]),
      ]);

      expect(facet.values).toHaveLength(1);
      expect(facet.values[0].count).toBe(7);
    });

    it('keeps genuinely different measurements apart', () => {
      const [facet] = mapAttributeFacets([
        criteriaFacet({ criteriaId: 206, criteriaType: 'N' }, [
          { rawValue: '193', formattedValue: '193', count: 3 },
          { rawValue: '193,5', formattedValue: '193,5', count: 1 },
        ]),
      ]);

      expect(facet.values.map((value) => value.label)).toEqual([
        '193',
        '193,5',
      ]);
    });

    // Two key-table entries rendering one label are indistinguishable on
    // screen: "единица-мярка за количество" files `SA` and `S`, both
    // "комплект", matching 62 and 8 articles.
    it('merges key-table values that share a label', () => {
      const [facet] = mapAttributeFacets([
        criteriaFacet({ criteriaId: 680, criteriaType: 'K' }, [
          { rawValue: 'SA', formattedValue: 'комплект', count: 62 },
          { rawValue: 'S', formattedValue: 'комплект', count: 8 },
        ]),
      ]);

      expect(facet.values).toEqual([
        {
          value: `S${MERGED_VALUE_SEPARATOR}SA`,
          label: 'комплект',
          count: 70,
        },
      ]);
    });

    // The merged token goes into the URL, so an order that depended on which
    // spelling TecDoc happened to list first would change the link between two
    // identical searches — and with it the cache key and the selected state.
    it('orders the raw values inside the token deterministically', () => {
      const [ascending] = mapAttributeFacets([
        criteriaFacet({ criteriaId: 206 }, [
          { rawValue: '193', formattedValue: '193', count: 1 },
          { rawValue: '193,0', formattedValue: '193', count: 2 },
        ]),
      ]);
      const [descending] = mapAttributeFacets([
        criteriaFacet({ criteriaId: 206 }, [
          { rawValue: '193,0', formattedValue: '193', count: 2 },
          { rawValue: '193', formattedValue: '193', count: 1 },
        ]),
      ]);

      expect(ascending.values[0].value).toBe(descending.values[0].value);
    });

    // A lone value must not gain a separator: it would rewrite every existing
    // link for the overwhelming majority of values, which never merge.
    it('leaves an unmerged value as its own raw value', () => {
      const [facet] = mapAttributeFacets([
        criteriaFacet({ criteriaId: 206 }, [
          { rawValue: '193', formattedValue: '193', count: 3 },
        ]),
      ]);

      expect(facet.values[0].value).toBe('193');
    });

    it('labels a merged value after the spelling most articles use', () => {
      const [facet] = mapAttributeFacets([
        criteriaFacet({ criteriaId: 206 }, [
          { rawValue: '193,0', formattedValue: '193,0', count: 4 },
          { rawValue: '193', formattedValue: '193', count: 400 },
        ]),
      ]);

      expect(facet.values[0].label).toBe('193');
    });
  });

  /**
   * TecDoc returns criteria values in no order at all — measured live, 31 of
   * 33 multi-value numeric criteria arrived unsorted — and its own
   * `includeCriteriaFacetsSorting` is refused on our account, so the order has
   * to be imposed here.
   */
  describe('value ordering', () => {
    it('orders a numeric criterion by its measurement, ascending', () => {
      const [facet] = mapAttributeFacets([
        criteriaFacet({ criteriaId: 209, criteriaType: 'N' }, [
          { rawValue: '100', formattedValue: '100', count: 1 },
          { rawValue: '89', formattedValue: '89', count: 1 },
          { rawValue: '9,5', formattedValue: '9,5', count: 1 },
        ]),
      ]);

      expect(facet.values.map((value) => value.label)).toEqual([
        '9,5',
        '89',
        '100',
      ]);
    });

    // A criterion TecDoc types numeric can still hold a value that is not a
    // number. It has no place on the scale, so it goes after it rather than
    // sorting as NaN.
    it('puts a numeric criterion\u2019s unparseable values last', () => {
      const [facet] = mapAttributeFacets([
        criteriaFacet({ criteriaId: 209, criteriaType: 'N' }, [
          {
            rawValue: 'на запитване',
            formattedValue: 'на запитване',
            count: 9,
          },
          { rawValue: '12', formattedValue: '12', count: 1 },
        ]),
      ]);

      expect(facet.values.map((value) => value.label)).toEqual([
        '12',
        'на запитване',
      ]);
    });

    // A key table is an enumeration, not a scale, so there is no order
    // inherent in it and the most-matched value is the most useful first.
    it('orders a key table by count, most matched first', () => {
      const [facet] = mapAttributeFacets([
        criteriaFacet({ criteriaId: 467, criteriaType: 'K' }, [
          { rawValue: 'rare', formattedValue: 'триъгълен', count: 2 },
          { rawValue: 'common', formattedValue: 'кръгъл', count: 90 },
        ]),
      ]);

      expect(facet.values.map((value) => value.label)).toEqual([
        'кръгъл',
        'триъгълен',
      ]);
    });

    it('breaks a count tie on the label so paging cannot reshuffle', () => {
      const [facet] = mapAttributeFacets([
        criteriaFacet({ criteriaId: 467, criteriaType: 'K' }, [
          { rawValue: 'b', formattedValue: 'Б', count: 4 },
          { rawValue: 'a', formattedValue: 'А', count: 4 },
        ]),
      ]);

      expect(facet.values.map((value) => value.label)).toEqual(['А', 'Б']);
    });
  });

  /**
   * A numeric criterion can offer more values than any sidebar can show:
   * `височина [mm]` measured 1,632 and `за OE-номер` 2,216, which together
   * with the rest made the criteria block 95% of the enumeration response
   * (38 KB without it, 796 KB with).
   */
  describe('capping a criterion\u2019s values', () => {
    it('keeps the most-matched values when there are more than the cap', () => {
      const [facet] = mapAttributeFacets([
        criteriaFacet({ criteriaId: 209 }, numericValues(500)),
      ]);

      expect(facet.values).toHaveLength(DIMENSION_VALUE_LIMIT);
      expect(facet.values.at(-1)).toEqual({
        value: '500',
        label: '500',
        count: 500,
      });
    });

    it('still orders the kept values by measurement, not by count', () => {
      const [facet] = mapAttributeFacets([
        criteriaFacet({ criteriaId: 209 }, numericValues(500)),
      ]);

      const measurements = facet.values.map((value) => Number(value.label));

      expect(measurements).toEqual([...measurements].sort((a, b) => a - b));
    });

    it('leaves a criterion under the cap untouched', () => {
      const [facet] = mapAttributeFacets([
        criteriaFacet({ criteriaId: 209 }, numericValues(5)),
      ]);

      expect(facet.values).toHaveLength(5);
    });

    // The selection names the sidebar's own state: capped away, the pill the
    // visitor picked disappears while the filter it applies stays on, which
    // reads as a search that has silently lost half the catalogue.
    it('keeps a selected value the cap would otherwise drop', () => {
      const [facet] = mapAttributeFacets(
        [criteriaFacet({ criteriaId: 209 }, numericValues(500))],
        [{ criteriaId: 209, rawValue: '1' }],
      );

      expect(facet.values).toHaveLength(DIMENSION_VALUE_LIMIT + 1);
      expect(facet.values[0]).toEqual({ value: '1', label: '1', count: 1 });
    });

    it('does not repeat a selected value already inside the cap', () => {
      const [facet] = mapAttributeFacets(
        [criteriaFacet({ criteriaId: 209 }, numericValues(500))],
        [{ criteriaId: 209, rawValue: '500' }],
      );

      expect(facet.values).toHaveLength(DIMENSION_VALUE_LIMIT);
    });

    // A merged value is selected by any of its spellings: the URL carries the
    // token, but a link built before the merge shipped carries one half of it.
    it('keeps a merged value selected by only one of its raw spellings', () => {
      const [facet] = mapAttributeFacets(
        [
          criteriaFacet({ criteriaId: 209 }, [
            ...numericValues(500),
            { rawValue: '0,5', formattedValue: '0,5', count: 1 },
            { rawValue: '0.5', formattedValue: '0,5', count: 1 },
          ]),
        ],
        [{ criteriaId: 209, rawValue: '0.5' }],
      );

      expect(facet.values[0]).toEqual({
        value: `0,5${MERGED_VALUE_SEPARATOR}0.5`,
        label: '0,5',
        count: 2,
      });
    });

    it('ignores a selection belonging to another criterion', () => {
      const [facet] = mapAttributeFacets(
        [criteriaFacet({ criteriaId: 209 }, numericValues(500))],
        [{ criteriaId: 206, rawValue: '1' }],
      );

      expect(facet.values).toHaveLength(DIMENSION_VALUE_LIMIT);
    });
  });
});

describe('splitMergedValue', () => {
  it('returns a lone raw value unchanged', () => {
    expect(splitMergedValue('193')).toEqual(['193']);
  });

  it('splits a merged token back into every spelling it stands for', () => {
    expect(splitMergedValue(`193${MERGED_VALUE_SEPARATOR}193,0`)).toEqual([
      '193',
      '193,0',
    ]);
  });

  it('drops empty segments rather than forwarding a blank filter', () => {
    expect(splitMergedValue(`193${MERGED_VALUE_SEPARATOR}`)).toEqual(['193']);
    expect(splitMergedValue(MERGED_VALUE_SEPARATOR)).toEqual([]);
  });
});
