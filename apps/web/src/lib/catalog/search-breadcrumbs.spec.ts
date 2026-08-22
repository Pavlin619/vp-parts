import {
  SearchMode,
  type CategoryNavigationDto,
  type CategoryOptionDto,
  type SearchFacetDto,
} from '@vp-parts-shop/shared'
import { buildSearchBreadcrumbs } from './search-breadcrumbs'
import { newSearch, type SearchUrlState } from './search-url'

// ── Helpers ──────────────────────────────────────────────────────────────────

function state(overrides: Partial<SearchUrlState> = {}): SearchUrlState {
  return {
    ...newSearch({ query: 'въздушен филтър', mode: SearchMode.Generic }),
    ...overrides,
  }
}

function category(id: string, label: string): CategoryOptionDto {
  return { id, label, count: 4, hasChildren: true }
}

function navigation(
  overrides: Partial<CategoryNavigationDto> = {},
): CategoryNavigationDto {
  return { current: null, ancestors: [], options: [], ...overrides }
}

function productTypeFacet(values: Array<[string, string]>): SearchFacetDto[] {
  return [
    {
      id: 'productTypes',
      values: values.map(([id, label]) => ({ id, label, count: 1 })),
    },
  ]
}

const labels = (items: Array<{ label: string }>) =>
  items.map((item) => item.label)

/** The query string of a crumb's href, decoded so assertions stay readable. */
function query(href: string | undefined): string {
  return decodeURIComponent(
    (href ?? '').replace('/search?', '').replace(/\+/g, ' '),
  )
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('buildSearchBreadcrumbs', () => {
  it('anchors an unnarrowed search at the catalogue root', () => {
    const crumbs = buildSearchBreadcrumbs({ state: state() })

    expect(labels(crumbs)).toEqual(['Начало', 'Всички категории'])
    expect(crumbs[0].href).toBe('/')
  })

  // The term is already the page heading, and repeating it in the trail says
  // nothing about where in the catalogue the visitor is standing.
  it('never names the search term', () => {
    const crumbs = buildSearchBreadcrumbs({
      state: state({ query: 'въздушен филтър', categoryPath: ['100300'] }),
      categoryNavigation: navigation({
        current: category('100300', 'Въздушен филтър'),
        ancestors: [category('100', 'Филтри')],
      }),
    })

    expect(
      crumbs.some((crumb) => crumb.label.includes('въздушен филтър')),
    ).toBe(false)
  })

  it('renders the category trail outermost first', () => {
    const crumbs = buildSearchBreadcrumbs({
      state: state({ categoryPath: ['100300'] }),
      categoryNavigation: navigation({
        current: category('100300', 'Въздушен филтър'),
        ancestors: [category('100', 'Филтри')],
      }),
    })

    expect(labels(crumbs)).toEqual([
      'Начало',
      'Всички категории',
      'Филтри',
      'Въздушен филтър',
    ])
  })

  // Wherever the visitor came from, a crumb stands for a node of the tree, so
  // the URL it points at spells out that node's own path.
  it('points each crumb at its full path in the tree', () => {
    const crumbs = buildSearchBreadcrumbs({
      state: state({ categoryPath: ['100300'] }),
      categoryNavigation: navigation({
        current: category('100300', 'Въздушен филтър'),
        ancestors: [category('100', 'Филтри'), category('100200', 'Сухи')],
      }),
    })

    expect(query(crumbs[2].href)).toContain('cat=100')
    expect(query(crumbs[3].href)).toBe(
      'q=въздушен филтър&mode=generic&cat=100&cat=100200&catHasChildren=true',
    )
  })

  it('drops the category narrowing from the "all categories" crumb', () => {
    const crumbs = buildSearchBreadcrumbs({
      state: state({ categoryPath: ['100', '100300'] }),
      categoryNavigation: navigation({
        current: category('100300', 'Въздушен филтър'),
        ancestors: [category('100', 'Филтри')],
      }),
    })

    expect(query(crumbs[1].href)).toBe('q=въздушен филтър&mode=generic')
  })

  // The last crumb is the page the visitor is already on.
  it('leaves the last crumb unlinked', () => {
    const crumbs = buildSearchBreadcrumbs({
      state: state({ categoryPath: ['100300'] }),
      categoryNavigation: navigation({
        current: category('100300', 'Въздушен филтър'),
        ancestors: [category('100', 'Филтри')],
      }),
    })

    expect(crumbs.at(-1)?.href).toBeUndefined()
    expect(crumbs.slice(0, -1).every((crumb) => crumb.href)).toBe(true)
  })

  it('carries the vehicle scope through every crumb', () => {
    const crumbs = buildSearchBreadcrumbs({
      state: state({ vehicleId: '20154', categoryPath: ['100'] }),
      categoryNavigation: navigation({ current: category('100', 'Филтри') }),
    })

    expect(query(crumbs[1].href)).toContain('vehicleId=20154')
  })

  describe('product type', () => {
    it('appends the selected type below its category', () => {
      const crumbs = buildSearchBreadcrumbs({
        state: state({ categoryPath: ['100300'], productTypeId: '17' }),
        categoryNavigation: navigation({
          current: category('100300', 'Въздушен филтър / корпус'),
        }),
        facets: productTypeFacet([['17', 'Въздушен филтър']]),
      })

      expect(labels(crumbs)).toEqual([
        'Начало',
        'Всички категории',
        'Въздушен филтър / корпус',
        'Въздушен филтър',
      ])
    })

    it('relinks the category once a type sits below it', () => {
      const crumbs = buildSearchBreadcrumbs({
        state: state({ categoryPath: ['100300'], productTypeId: '17' }),
        categoryNavigation: navigation({
          current: category('100300', 'Въздушен филтър / корпус'),
        }),
        facets: productTypeFacet([['17', 'Въздушен филтър']]),
      })

      expect(crumbs[2].href).toBeTruthy()
    })

    // The drill hands over to product types when the tree runs out, which can
    // happen with no category selected at all.
    it('stands on its own when no category was drilled', () => {
      const crumbs = buildSearchBreadcrumbs({
        state: state({ productTypeId: '17' }),
        facets: productTypeFacet([['17', 'Въздушен филтър']]),
      })

      expect(labels(crumbs)).toEqual([
        'Начало',
        'Всички категории',
        'Въздушен филтър',
      ])
    })

    it('falls back to the id when the facet no longer carries the label', () => {
      const crumbs = buildSearchBreadcrumbs({
        state: state({ productTypeId: '17' }),
      })

      expect(crumbs.at(-1)?.label).toBe('17')
    })
  })

  describe('when the catalogue could not name the node', () => {
    // `current` is best-effort: TecDoc scopes the facet to the match set. The
    // trail must still say a category is applied, or it reads as unfiltered.
    it('still shows a crumb for a selected but unnamed category', () => {
      const crumbs = buildSearchBreadcrumbs({
        state: state({ categoryPath: ['100300'] }),
        categoryNavigation: navigation(),
      })

      expect(labels(crumbs)).toEqual([
        'Начало',
        'Всички категории',
        'Избрана категория',
      ])
    })

    it('shortens the trail rather than guessing missing ancestors', () => {
      const crumbs = buildSearchBreadcrumbs({
        state: state({ categoryPath: ['100', '100300'] }),
        categoryNavigation: navigation({
          current: category('100300', 'Въздушен филтър'),
        }),
      })

      expect(labels(crumbs)).toEqual([
        'Начало',
        'Всички категории',
        'Въздушен филтър',
      ])
    })
  })
})
