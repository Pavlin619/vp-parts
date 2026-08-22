import { render, screen } from '@testing-library/react'
import {
  SearchMode,
  type CategoryNavigationDto,
  type FacetValueDto,
} from '@vp-parts-shop/shared'
import { newSearch, type SearchUrlState } from '@/lib/catalog/search-url'
import { CategoryFilter } from './category-filter'

// ── Helpers ──────────────────────────────────────────────────────────────────

function state(overrides: Partial<SearchUrlState> = {}): SearchUrlState {
  return {
    ...newSearch({ query: 'филтър', mode: SearchMode.Generic }),
    ...overrides,
  }
}

const ROOT_LEVEL: CategoryNavigationDto = {
  current: null,
  ancestors: [],
  options: [
    { id: '100', label: 'Филтри', count: 24, hasChildren: true },
    { id: '200', label: 'Спирачна система', count: 8, hasChildren: true },
  ],
}

const LEAF_LEVEL: CategoryNavigationDto = {
  current: { id: '100', label: 'Филтри', count: 24, hasChildren: true },
  ancestors: [],
  options: [
    { id: '1052', label: 'Маслен филтър', count: 12, hasChildren: false },
  ],
}

/** A leaf assembly group: no categories left, only the generic articles in it. */
const EXHAUSTED_TREE: CategoryNavigationDto = {
  current: {
    id: '1052',
    label: 'Маслен филтър / корпус / уплътнител',
    count: 15,
    hasChildren: false,
  },
  ancestors: [],
  options: [],
}

/**
 * The four generic articles TecDoc files under that leaf — the case that makes
 * the level worth having: a "filter" group also holds its housing and cover.
 */
const PRODUCT_TYPES: FacetValueDto[] = [
  { id: '7', label: 'Маслен филтър', count: 13 },
  { id: '9', label: 'Корпус, маслен филтър', count: 1 },
  { id: '11', label: 'Капак, кутия на масления филтър', count: 1 },
]

/** The decoded href of a link, so query assertions stay readable. */
function hrefOf(name: RegExp | string): string {
  return decodeURIComponent(
    screen.getByRole('link', { name }).getAttribute('href') ?? '',
  )
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CategoryFilter', () => {
  it('lists the options at the current level with their counts', () => {
    render(<CategoryFilter state={state()} navigation={ROOT_LEVEL} />)

    expect(screen.getByText('Филтри')).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()
  })

  it('drills into a category, recording that it is a branch', () => {
    render(<CategoryFilter state={state()} navigation={ROOT_LEVEL} />)

    expect(hrefOf(/Филтри/)).toContain('cat=100')
    expect(hrefOf(/Филтри/)).toContain('catHasChildren=true')
  })

  // Only a leaf gets the dimension facets, so the hint has to say which it is.
  it('records a leaf as such when drilling into it', () => {
    render(
      <CategoryFilter state={state({ categoryPath: ['100'] })} navigation={LEAF_LEVEL} />,
    )

    expect(hrefOf(/Маслен филтър/)).toContain('catHasChildren=false')
  })

  describe('when nothing is selected', () => {
    // Nothing to render and nothing to clear — the block would be an empty card.
    it('renders nothing without options', () => {
      const { container } = render(
        <CategoryFilter
          state={state()}
          navigation={{ current: null, ancestors: [], options: [] }}
        />,
      )

      expect(container).toBeEmptyDOMElement()
    })

    it('renders nothing when the API omitted the navigation entirely', () => {
      const { container } = render(<CategoryFilter state={state()} />)

      expect(container).toBeEmptyDOMElement()
    })

    it('offers no way up', () => {
      render(<CategoryFilter state={state()} navigation={ROOT_LEVEL} />)

      expect(screen.queryByText(/нагоре|Всички категории/)).not.toBeInTheDocument()
    })
  })

  describe('when drilled in', () => {
    const drilled = state({ categoryPath: ['100'], categoryHasChildren: true })

    it('names the selected category', () => {
      render(<CategoryFilter state={drilled} navigation={LEAF_LEVEL} />)

      expect(screen.getByText('Филтри')).toBeInTheDocument()
    })

    // This block steps rather than jumps, so the trail it walks is the URL's.
    it('steps back to the top from the first level', () => {
      render(<CategoryFilter state={drilled} navigation={LEAF_LEVEL} />)

      expect(hrefOf(/Всички категории/)).not.toContain('cat=')
    })

    it('steps up one level from deeper in', () => {
      const deeper = state({
        categoryPath: ['100', '1052'],
        categoryHasChildren: false,
      })
      render(<CategoryFilter state={deeper} navigation={LEAF_LEVEL} />)

      const href = hrefOf(/Едно ниво нагоре/)
      expect(href).toContain('cat=100')
      expect(href).not.toContain('cat=1052')
    })

    it('clears the whole path at once', () => {
      render(<CategoryFilter state={drilled} navigation={LEAF_LEVEL} />)

      expect(hrefOf('Изчисти')).not.toContain('cat=')
    })

    // A leaf has no children to offer, but the block must stay so the visitor
    // can still get back out of it.
    it('says so when the selected category has no subcategories', () => {
      render(
        <CategoryFilter
          state={drilled}
          navigation={{
            current: LEAF_LEVEL.current,
            ancestors: [],
            options: [],
          }}
        />,
      )

      expect(
        screen.getByText(/Няма по-подробни подкатегории/),
      ).toBeInTheDocument()
    })
  })

  describe('product types', () => {
    const atLeaf = state({
      categoryPath: ['100', '1052'],
      categoryHasChildren: false,
    })

    it('offers the generic articles once the category tree runs out', () => {
      render(
        <CategoryFilter
          state={atLeaf}
          navigation={EXHAUSTED_TREE}
          productTypes={PRODUCT_TYPES}
        />,
      )

      expect(screen.getByText('Корпус, маслен филтър')).toBeInTheDocument()
      expect(screen.getByText('13')).toBeInTheDocument()
    })

    it('titles the block by the level it is offering', () => {
      render(
        <CategoryFilter
          state={atLeaf}
          navigation={EXHAUSTED_TREE}
          productTypes={PRODUCT_TYPES}
        />,
      )

      expect(screen.getByRole('heading', { name: 'Вид част' })).toBeInTheDocument()
    })

    // The drill is one path: while the tree still branches, the branches win.
    it('keeps offering categories while the tree still branches', () => {
      render(
        <CategoryFilter
          state={state()}
          navigation={ROOT_LEVEL}
          productTypes={PRODUCT_TYPES}
        />,
      )

      expect(screen.queryByText('Корпус, маслен филтър')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Категории' })).toBeInTheDocument()
    })

    it('descends into a type without leaving the category', () => {
      render(
        <CategoryFilter
          state={atLeaf}
          navigation={EXHAUSTED_TREE}
          productTypes={PRODUCT_TYPES}
        />,
      )

      const href = hrefOf(/Корпус, маслен филтър/)
      expect(href).toContain('type=9')
      expect(href).toContain('cat=1052')
    })

    // A search whose results carry no category counts would otherwise strand
    // the visitor behind a tree that never appears.
    it('offers them at the top when there is no category tree at all', () => {
      render(
        <CategoryFilter
          state={state()}
          navigation={{ current: null, ancestors: [], options: [] }}
          productTypes={PRODUCT_TYPES}
        />,
      )

      expect(screen.getByText('Маслен филтър')).toBeInTheDocument()
    })

    describe('once one is selected', () => {
      const selected = state({
        categoryPath: ['100', '1052'],
        categoryHasChildren: false,
        productTypeId: '9',
      })

      it('names it as the level reached', () => {
        render(
          <CategoryFilter
            state={selected}
            navigation={EXHAUSTED_TREE}
            productTypes={PRODUCT_TYPES}
          />,
        )

        expect(screen.getByText('Корпус, маслен филтър')).toBeInTheDocument()
      })

      // It is the deepest level: the siblings would read as a widening.
      it('stops offering the siblings', () => {
        render(
          <CategoryFilter
            state={selected}
            navigation={EXHAUSTED_TREE}
            productTypes={PRODUCT_TYPES}
          />,
        )

        expect(screen.queryByText('Маслен филтър')).not.toBeInTheDocument()
        expect(
          screen.queryByText(/Няма по-подробни подкатегории/),
        ).not.toBeInTheDocument()
      })

      it('steps up out of the type and back to its category', () => {
        render(
          <CategoryFilter
            state={selected}
            navigation={EXHAUSTED_TREE}
            productTypes={PRODUCT_TYPES}
          />,
        )

        const href = hrefOf(/Едно ниво нагоре/)
        expect(href).not.toContain('type=')
        expect(href).toContain('cat=1052')
      })

      // The block has to survive the facet block disappearing, or the visitor
      // is left with a filter applied and no way back out of it.
      it('still offers a way up when the facet no longer lists it', () => {
        render(
          <CategoryFilter
            state={selected}
            navigation={EXHAUSTED_TREE}
            productTypes={[]}
          />,
        )

        expect(hrefOf(/Едно ниво нагоре/)).not.toContain('type=')
      })
    })
  })
})
