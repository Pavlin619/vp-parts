import {
  buildCategoryNavigation,
  buildCategorySuggestions,
  mapAttributeFacets,
  mapBrandFacets,
  mapProductTypeFacets,
  TecDocAssemblyGroupFacetCount,
  TecDocCriteriaFacetCount,
  TecDocCriteriaInfo,
  TecDocCriteriaValueCount,
} from './search-facet-mappers';
import { FITTING_POSITION_CRITERIA_ID } from './search-types';

function node(
  assemblyGroupNodeId: number,
  overrides: Partial<TecDocAssemblyGroupFacetCount> = {},
): TecDocAssemblyGroupFacetCount {
  return {
    assemblyGroupNodeId,
    assemblyGroupName: `Group ${assemblyGroupNodeId}`,
    ...overrides,
  };
}

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

describe('mapBrandFacets', () => {
  it('maps counts to a single brand group with the logo left for the brands layer', () => {
    expect(
      mapBrandFacets([{ dataSupplierId: 4, mfrName: 'WIX', count: 12 }]),
    ).toEqual([
      {
        id: 'brands',
        values: [{ id: '4', label: 'WIX', count: 12, imageUrl: null }],
      },
    ]);
  });

  // A facet the user cannot apply is worse than no facet at all.
  it('drops the group entirely when there are no counts', () => {
    expect(mapBrandFacets([])).toEqual([]);
    expect(mapBrandFacets()).toEqual([]);
  });
});

describe('mapProductTypeFacets', () => {
  it('maps generic-article counts to a single product-type group', () => {
    expect(
      mapProductTypeFacets([
        {
          genericArticleId: 7,
          genericArticleDescription: 'Маслен филтър',
          count: 12,
        },
      ]),
    ).toEqual([
      {
        id: 'productTypes',
        values: [{ id: '7', label: 'Маслен филтър', count: 12 }],
      },
    ]);
  });

  // Product types have no logo, and an explicit null would invite the brands
  // layer to fill one in from an id that means something else entirely.
  it('leaves imageUrl off the values rather than setting it null', () => {
    const [facet] = mapProductTypeFacets([
      {
        genericArticleId: 7,
        genericArticleDescription: 'Маслен филтър',
        count: 1,
      },
    ]);

    expect(facet.values[0]).not.toHaveProperty('imageUrl');
  });

  it('drops the group entirely when there are no counts', () => {
    expect(mapProductTypeFacets([])).toEqual([]);
    expect(mapProductTypeFacets()).toEqual([]);
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
      criteriaFacet({ criteriaId: 20 }, [
        { rawValue: 'front', formattedValue: 'Front', count: 1 },
      ]),
    ]);

    expect(facet.unit).toBeNull();
  });

  // The catalogue's own statement of which criteria identify the part; the
  // client leads the dimension list with them.
  it('carries the mandatory flag through', () => {
    const [mandatory, optional] = mapAttributeFacets([
      criteriaFacet({ criteriaId: 20, isMandatory: true }, [
        { rawValue: '106.4', formattedValue: '106,4', count: 3 },
      ]),
      criteriaFacet({ criteriaId: 21, isMandatory: false }, [
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

  // `applyDqmRules` marks rather than filters: the impermissible values still
  // arrive, flagged, and dropping them here is what the flag actually buys.
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
});

describe('buildCategoryNavigation', () => {
  it('returns empty navigation when TecDoc sent no facet block', () => {
    expect(buildCategoryNavigation()).toEqual({
      current: null,
      ancestors: [],
      options: [],
    });
  });

  it('lists the selected node\u2019s children as the options and resolves current', () => {
    const counts = [
      node(100, { children: 2 }),
      node(101, { parentNodeId: 100, count: 5 }),
      node(102, { parentNodeId: 100, count: 3 }),
    ];

    expect(buildCategoryNavigation(counts, 100)).toEqual({
      current: {
        id: '100',
        label: 'Group 100',
        count: null,
        hasChildren: true,
      },
      ancestors: [],
      options: [
        { id: '101', label: 'Group 101', count: 5, hasChildren: false },
        { id: '102', label: 'Group 102', count: 3, hasChildren: false },
      ],
    });
  });

  // TecDoc scopes the facet to the match set, so a node's parent may be absent
  // from the response. Such a node is a root of what was actually returned.
  it('treats a node whose parent is missing from the response as a root', () => {
    const counts = [node(101, { parentNodeId: 999 })];

    expect(buildCategoryNavigation(counts).options).toEqual([
      { id: '101', label: 'Group 101', count: null, hasChildren: false },
    ]);
  });

  // Otherwise a node whose children were not returned would look like a leaf
  // and wrongly unlock the attribute facets.
  it('honours the children count when the children themselves were not returned', () => {
    const [option] = buildCategoryNavigation([
      node(100, { children: 4 }),
    ]).options;

    expect(option.hasChildren).toBe(true);
  });

  it('leaves current null when the selected node is absent from the facet', () => {
    const navigation = buildCategoryNavigation([node(101)], 555);

    expect(navigation.current).toBeNull();
    expect(navigation.ancestors).toEqual([]);
    expect(navigation.options).toEqual([]);
  });

  describe('ancestors', () => {
    it('walks the parent links outwards, outermost first', () => {
      const counts = [
        node(100, { children: 1 }),
        node(200, { parentNodeId: 100, children: 1 }),
        node(300, { parentNodeId: 200 }),
      ];

      expect(buildCategoryNavigation(counts, 300).ancestors).toEqual([
        { id: '100', label: 'Group 100', count: null, hasChildren: true },
        { id: '200', label: 'Group 200', count: null, hasChildren: true },
      ]);
    });

    it('excludes the selected node itself', () => {
      const counts = [
        node(100, { children: 1 }),
        node(200, { parentNodeId: 100 }),
      ];

      const { ancestors } = buildCategoryNavigation(counts, 200);

      expect(ancestors.map((ancestor) => ancestor.id)).toEqual(['100']);
    });

    // The facet is scoped to the match set, so the chain can run out before it
    // reaches a root. A partial trail is the honest answer.
    it('stops where the facet stops rather than inventing the missing ancestor', () => {
      const counts = [node(300, { parentNodeId: 200 })];

      expect(buildCategoryNavigation(counts, 300).ancestors).toEqual([]);
    });

    it('is empty when nothing is selected', () => {
      expect(buildCategoryNavigation([node(100)]).ancestors).toEqual([]);
    });

    // A parent link that cycles is malformed data, but it reaches us over an
    // untyped JSON transport, so it must not hang the request.
    it('terminates on a cyclic parent link', () => {
      const counts = [
        node(100, { parentNodeId: 200 }),
        node(200, { parentNodeId: 100 }),
      ];

      expect(
        buildCategoryNavigation(counts, 100).ancestors.map((a) => a.id),
      ).toEqual(['200']);
    });
  });
});

describe('buildCategorySuggestions', () => {
  it('returns nothing when the matches fall in a single category', () => {
    expect(buildCategorySuggestions('WL63', [node(101)])).toEqual([]);
  });

  it('keeps only leaves, ordered by count', () => {
    const counts = [
      node(100, { children: 2 }),
      node(101, { parentNodeId: 100, count: 3 }),
      node(102, { parentNodeId: 100, count: 9 }),
    ];

    expect(buildCategorySuggestions('WL63', counts)).toEqual([
      {
        kind: 'category',
        term: 'WL63',
        categoryNodeId: '102',
        label: 'Group 102',
        count: 9,
      },
      {
        kind: 'category',
        term: 'WL63',
        categoryNodeId: '101',
        label: 'Group 101',
        count: 3,
      },
    ]);
  });

  // A node other rows point at is a parent even if TecDoc omitted its
  // children count.
  it('excludes a node that is named as another node\u2019s parent', () => {
    const counts = [
      node(100),
      node(101, { parentNodeId: 100 }),
      node(102, { parentNodeId: 100 }),
    ];

    expect(
      buildCategorySuggestions('WL63', counts).map((s) => s.categoryNodeId),
    ).toEqual(['101', '102']);
  });
});
