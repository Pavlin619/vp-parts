import {
  buildCategoryNavigation,
  buildCategorySuggestions,
  mapAttributeFacets,
  mapBrandFacets,
  TecDocAssemblyGroupFacetCount,
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

describe('mapBrandFacets', () => {
  it('maps counts to a single brand group with the logo left for the brands layer', () => {
    expect(
      mapBrandFacets([{ dataSupplierId: 4, mfrName: 'WIX', count: 12 }]),
    ).toEqual([
      {
        id: 'brands',
        label: 'Производител',
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

describe('mapAttributeFacets', () => {
  it('defaults an absent unit, type and interval flag', () => {
    const [facet] = mapAttributeFacets([
      {
        criteriaId: 20,
        criteriaDescription: 'Diameter',
        criteriaValues: [
          { rawValue: '106.4', formattedValue: '106,4', count: 3 },
        ],
      },
    ]);

    expect(facet).toEqual({
      id: '20',
      label: 'Diameter',
      unit: null,
      type: 'A',
      isInterval: false,
      role: null,
      values: [{ value: '106.4', label: '106,4', count: 3 }],
    });
  });

  it('tags the fitting-position criterion with its semantic role', () => {
    const [facet] = mapAttributeFacets([
      {
        criteriaId: Number(FITTING_POSITION_CRITERIA_ID),
        criteriaDescription: 'Позиция на монтаж',
        criteriaValues: [
          { rawValue: 'front', formattedValue: 'Отпред', count: 1 },
        ],
      },
    ]);

    expect(facet.role).toBe('fitting-position');
  });

  it('drops criteria that carry no values', () => {
    expect(
      mapAttributeFacets([
        {
          criteriaId: 20,
          criteriaDescription: 'Diameter',
          criteriaValues: [],
        },
      ]),
    ).toEqual([]);
  });
});

describe('buildCategoryNavigation', () => {
  it('returns empty navigation when TecDoc sent no facet block', () => {
    expect(buildCategoryNavigation()).toEqual({ current: null, options: [] });
  });

  it('lists the selected node\u2019s children as the options and resolves current', () => {
    const counts = [
      node(100, { childCount: 2 }),
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
  it('honours childCount when the children themselves were not returned', () => {
    const [option] = buildCategoryNavigation([
      node(100, { childCount: 4 }),
    ]).options;

    expect(option.hasChildren).toBe(true);
  });

  it('leaves current null when the selected node is absent from the facet', () => {
    const navigation = buildCategoryNavigation([node(101)], 555);

    expect(navigation.current).toBeNull();
    expect(navigation.options).toEqual([]);
  });
});

describe('buildCategorySuggestions', () => {
  it('returns nothing when the matches fall in a single category', () => {
    expect(buildCategorySuggestions('WL63', [node(101)])).toEqual([]);
  });

  it('keeps only leaves, ordered by count', () => {
    const counts = [
      node(100, { childCount: 2 }),
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
  // childCount.
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
