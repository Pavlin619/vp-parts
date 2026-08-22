import { render, screen } from '@testing-library/react'
import {
  SearchMode,
  type AttributeFacetDto,
  type CategoryNavigationDto,
  type SearchFacetDto,
} from '@vp-parts-shop/shared'
import { newSearch, type SearchUrlState } from '@/lib/catalog/search-url'
import { ActiveFilters } from './active-filters'

// ── Helpers ──────────────────────────────────────────────────────────────────

function state(overrides: Partial<SearchUrlState> = {}): SearchUrlState {
  return {
    ...newSearch({ query: 'филтър', mode: SearchMode.Generic }),
    ...overrides,
  }
}

const BRAND_FACETS: SearchFacetDto[] = [
  {
    id: 'brands',
    values: [
      { id: '268', label: 'WIX', count: 5, imageUrl: null },
      { id: '30', label: 'Bosch', count: 3, imageUrl: null },
    ],
  },
]

/**
 * A brand and a product type deliberately sharing the id `268`: TecDoc ids are
 * only unique within their own facet.
 */
const COLLIDING_FACETS: SearchFacetDto[] = [
  ...BRAND_FACETS,
  {
    id: 'productTypes',
    values: [{ id: '268', label: 'Маслен филтър', count: 4 }],
  },
]

const ATTRIBUTE_FACETS: AttributeFacetDto[] = [
  {
    id: '20',
    label: 'Височина',
    unit: 'mm',
    type: 'N',
    isInterval: false,
    isMandatory: true,
    role: null,
    values: [{ value: '47', label: '47', count: 9 }],
  },
]

const NAVIGATION: CategoryNavigationDto = {
  current: { id: '1052', label: 'Маслен филтър', count: 12, hasChildren: false },
  options: [],
}

/** A category named apart from the product type, so one chip can be singled out. */
const FILTERS_NAVIGATION: CategoryNavigationDto = {
  current: { id: '1052', label: 'Филтри', count: 12, hasChildren: false },
  options: [],
}

function hrefOf(name: RegExp): string {
  return decodeURIComponent(
    screen.getByRole('link', { name }).getAttribute('href') ?? '',
  )
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ActiveFilters', () => {
  it('renders nothing when no filter is applied', () => {
    const { container } = render(<ActiveFilters state={state()} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('names the selected brand rather than its id', () => {
    render(
      <ActiveFilters state={state({ brandIds: ['268'] })} facets={BRAND_FACETS} />,
    )

    expect(screen.getByRole('link', { name: /Премахни филтъра WIX/ })).toBeInTheDocument()
  })

  // A narrowed search can stop TecDoc reporting the other brands, and a chip
  // with no label would be a filter the visitor cannot identify.
  it('falls back to the id when the brand is missing from the facet', () => {
    render(<ActiveFilters state={state({ brandIds: ['999'] })} facets={BRAND_FACETS} />)

    expect(screen.getByRole('link', { name: /Премахни филтъра 999/ })).toBeInTheDocument()
  })

  it('names the selected product type rather than its id', () => {
    render(
      <ActiveFilters
        state={state({ productTypeId: '268' })}
        facets={COLLIDING_FACETS}
      />,
    )

    expect(
      screen.getByRole('link', { name: /Премахни филтъра Маслен филтър/ }),
    ).toBeInTheDocument()
  })

  // Each chip must read its label from its own facet: a flattened lookup would
  // label the brand "Маслен филтър" or the type "WIX", depending on order.
  it('labels a colliding brand and product type from their own facets', () => {
    render(
      <ActiveFilters
        state={state({ brandIds: ['268'], productTypeId: '268' })}
        facets={COLLIDING_FACETS}
      />,
    )

    expect(
      screen.getByRole('link', { name: /Премахни филтъра WIX/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Премахни филтъра Маслен филтър/ }),
    ).toBeInTheDocument()
  })

  it('names the selected category', () => {
    render(
      <ActiveFilters
        state={state({ categoryPath: ['1052'] })}
        categoryNavigation={NAVIGATION}
      />,
    )

    expect(
      screen.getByRole('link', { name: /Премахни филтъра Маслен филтър/ }),
    ).toBeInTheDocument()
  })

  it('qualifies an attribute chip with its criterion', () => {
    render(
      <ActiveFilters
        state={state({ attributes: [{ criteriaId: '20', value: '47' }] })}
        attributes={ATTRIBUTE_FACETS}
      />,
    )

    expect(
      screen.getByRole('link', { name: /Премахни филтъра Височина: 47/ }),
    ).toBeInTheDocument()
  })

  // Page 2 carries no attribute block, so the raw value has to stand in — which
  // is why the chip must not depend on the facet being present.
  it('falls back to the raw value when the attribute facet is absent', () => {
    render(
      <ActiveFilters
        state={state({ attributes: [{ criteriaId: '20', value: '47' }] })}
      />,
    )

    expect(screen.getByRole('link', { name: /Премахни филтъра 47/ })).toBeInTheDocument()
  })

  describe('removal', () => {
    it('drops just that brand', () => {
      render(
        <ActiveFilters
          state={state({ brandIds: ['268', '30'] })}
          facets={BRAND_FACETS}
        />,
      )

      const href = hrefOf(/Премахни филтъра WIX/)
      expect(href).not.toContain('brand=268')
      expect(href).toContain('brand=30')
    })

    // Stepping out of the product type leaves the assembly group it was listed
    // under selected — the chip removes one drill level, not the whole path.
    it('drops the product type but keeps the category', () => {
      render(
        <ActiveFilters
          state={state({ categoryPath: ['1052'], productTypeId: '268' })}
          facets={COLLIDING_FACETS}
          categoryNavigation={FILTERS_NAVIGATION}
        />,
      )

      const href = hrefOf(/Премахни филтъра Маслен филтър/)
      expect(href).not.toContain('type=268')
      expect(href).toContain('cat=1052')
    })

    it('drops the whole category path', () => {
      render(
        <ActiveFilters
          state={state({ categoryPath: ['100', '1052'] })}
          categoryNavigation={NAVIGATION}
        />,
      )

      expect(hrefOf(/Премахни филтъра Маслен филтър/)).not.toContain('cat=')
    })

    it('clears everything but keeps the query and mode', () => {
      render(
        <ActiveFilters
          state={state({ brandIds: ['268'], categoryPath: ['1052'] })}
          facets={BRAND_FACETS}
        />,
      )

      const href = hrefOf(/Изчисти всички/)
      expect(href).toContain('q=филтър')
      expect(href).toContain('mode=generic')
      expect(href).not.toContain('brand=')
      expect(href).not.toContain('cat=')
    })
  })
})
