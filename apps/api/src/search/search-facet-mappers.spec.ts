import { AssemblyGroupType } from '../tecdoc';
import {
  buildCategoryNavigation,
  buildCategorySuggestions,
  mapBrandFacets,
  mapProductTypeFacets,
  PRODUCT_TYPE_FACET_LIMIT,
  TecDocAssemblyGroupFacetCount,
  TecDocGenericArticleFacetCount,
} from './search-facet-mappers';

/** `count` descends with the id, so the widest type is the highest id. */
function productTypeCounts(howMany: number): TecDocGenericArticleFacetCount[] {
  return Array.from({ length: howMany }, (_, index) => ({
    genericArticleId: index + 1,
    genericArticleDescription: `Type ${index + 1}`,
    count: index + 1,
  }));
}

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

  it('keeps the most-matched types when the count list is wider than the cap', () => {
    const [facet] = mapProductTypeFacets(productTypeCounts(200));

    expect(facet.values).toHaveLength(PRODUCT_TYPE_FACET_LIMIT);
    expect(facet.values[0]).toEqual({
      id: '200',
      label: 'Type 200',
      count: 200,
    });
    expect(facet.values.at(-1)?.count).toBe(200 - PRODUCT_TYPE_FACET_LIMIT + 1);
  });

  it('orders by count even when the list fits under the cap', () => {
    const [facet] = mapProductTypeFacets([
      { genericArticleId: 1, genericArticleDescription: 'Rare', count: 3 },
      { genericArticleId: 2, genericArticleDescription: 'Common', count: 90 },
    ]);

    expect(facet.values.map((value) => value.label)).toEqual([
      'Common',
      'Rare',
    ]);
  });

  // TecDoc counts the product types of the *unfiltered* set, so a page reached
  // by deep link resolves its own heading and breadcrumb out of this list. Cap
  // it away and the selection loses its name.
  it('keeps a selected type the cap would otherwise drop', () => {
    const [facet] = mapProductTypeFacets(productTypeCounts(200), [7]);

    expect(facet.values).toHaveLength(PRODUCT_TYPE_FACET_LIMIT + 1);
    expect(facet.values.at(-1)).toEqual({ id: '7', label: 'Type 7', count: 7 });
  });

  it('does not repeat a selected type that is already within the cap', () => {
    const [facet] = mapProductTypeFacets(productTypeCounts(200), [200]);

    expect(facet.values).toHaveLength(PRODUCT_TYPE_FACET_LIMIT);
    expect(facet.values.filter((value) => value.id === '200')).toHaveLength(1);
  });

  it('ignores a selected type the search never counted', () => {
    const [facet] = mapProductTypeFacets(productTypeCounts(3), [999]);

    expect(facet.values.map((value) => value.id)).toEqual(['3', '2', '1']);
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

  // The passenger-car and universal trees duplicate names outright: measured
  // catalogue-wide, "двигател" is both 100002 (passenger car) and 705972
  // (universal), and `q=филтър` had 9 of 37 root labels used twice.
  describe('labels that collide between two trees', () => {
    const passengerCar = { assemblyGroupType: AssemblyGroupType.PassengerCar };
    const universal = { assemblyGroupType: AssemblyGroupType.Universal };

    it('qualifies the universal side and leaves the passenger-car side plain', () => {
      const counts = [
        node(100002, { ...passengerCar, assemblyGroupName: 'двигател' }),
        node(705972, { ...universal, assemblyGroupName: 'двигател' }),
      ];

      expect(
        buildCategoryNavigation(counts).options.map((o) => o.label),
      ).toEqual(['двигател', 'двигател (универсални части)']);
    });

    // Suppressing one side would sometimes hide the larger category: measured
    // catalogue-wide, "климатична уредба" is 114 articles in the universal tree
    // against 87 in the passenger-car one.
    it('keeps both options rather than picking a winner', () => {
      const counts = [
        node(100243, { ...passengerCar, assemblyGroupName: 'кл', count: 87 }),
        node(701187, { ...universal, assemblyGroupName: 'кл', count: 114 }),
      ];

      expect(buildCategoryNavigation(counts).options).toEqual([
        { id: '100243', label: 'кл', count: 87, hasChildren: false },
        {
          id: '701187',
          label: 'кл (универсални части)',
          count: 114,
          hasChildren: false,
        },
      ]);
    });

    it('leaves a name that only one node uses untouched', () => {
      const counts = [
        node(100002, { ...passengerCar, assemblyGroupName: 'двигател' }),
        node(705972, { ...universal, assemblyGroupName: 'масла' }),
      ];

      expect(
        buildCategoryNavigation(counts).options.map((o) => o.label),
      ).toEqual(['двигател', 'масла']);
    });

    // Siblings are what one level renders side by side. The same name under two
    // different parents is told apart by where the visitor already is.
    it('does not qualify a repeated name that is not shown side by side', () => {
      const counts = [
        node(1, { ...passengerCar, assemblyGroupName: 'корпус' }),
        node(2, { ...universal, assemblyGroupName: 'корпус' }),
        node(10, {
          parentNodeId: 1,
          ...passengerCar,
          assemblyGroupName: 'ремък',
        }),
        node(20, { parentNodeId: 2, ...universal, assemblyGroupName: 'ремък' }),
      ];

      const children = buildCategoryNavigation(counts, 1).options;

      expect(children.map((o) => o.label)).toEqual(['ремък']);
      expect(buildCategoryNavigation(counts, 2).options[0].label).toBe('ремък');
    });

    // The breadcrumb has to read the same as the option that was clicked.
    it('qualifies current and the ancestors the same way', () => {
      const counts = [
        node(100002, { ...passengerCar, assemblyGroupName: 'двигател' }),
        node(705972, { ...universal, assemblyGroupName: 'двигател' }),
        node(705973, { parentNodeId: 705972, ...universal }),
      ];

      const navigation = buildCategoryNavigation(counts, 705973);

      expect(navigation.ancestors.map((a) => a.label)).toEqual([
        'двигател (универсални части)',
      ]);
    });

    // TecDoc marks the field required on every count, but it arrives over an
    // untyped transport: a node with no tree cannot be named, and inventing a
    // suffix for it would be worse than the duplicate it replaces.
    it('leaves a collision untouched when the tree type is missing', () => {
      const counts = [
        node(1, { assemblyGroupName: 'двигател' }),
        node(2, { assemblyGroupName: 'двигател' }),
      ];

      expect(
        buildCategoryNavigation(counts).options.map((o) => o.label),
      ).toEqual(['двигател', 'двигател']);
    });
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
