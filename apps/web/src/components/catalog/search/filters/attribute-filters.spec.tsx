import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchMode, type AttributeFacetDto } from '@vp-parts-shop/shared'
import { newSearch, type SearchUrlState } from '@/lib/catalog/search-url'
import { AttributeFilters } from './attribute-filters'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** At a leaf category — the only place the API computes attribute facets. */
function leafState(overrides: Partial<SearchUrlState> = {}): SearchUrlState {
  return {
    ...newSearch({ query: 'филтър', mode: SearchMode.Generic }),
    categoryPath: ['100', '1052'],
    categoryHasChildren: false,
    ...overrides,
  }
}

const HEIGHT: AttributeFacetDto = {
  id: '20',
  label: 'Височина',
  unit: 'mm',
  type: 'N',
  isInterval: false,
  isMandatory: true,
  role: null,
  values: [
    { value: '47', label: '47', count: 9 },
    { value: '52', label: '52', count: 3 },
  ],
}

/** Describes a part already identified, so TecDoc does not oblige suppliers. */
const MATERIAL: AttributeFacetDto = {
  id: '25',
  label: 'Материал',
  unit: null,
  type: 'A',
  isInterval: false,
  isMandatory: false,
  role: null,
  values: [
    { value: 'Хартия', label: 'Хартия', count: 8 },
    { value: 'Метал', label: 'Метал', count: 4 },
  ],
}

const FITTING_POSITION: AttributeFacetDto = {
  id: '100',
  label: 'Позиция на монтаж',
  unit: null,
  type: 'K',
  isInterval: false,
  isMandatory: true,
  role: 'fitting-position',
  values: [
    { value: 'Отпред', label: 'Отпред', count: 6 },
    { value: 'Отзад', label: 'Отзад', count: 4 },
  ],
}

/** A criterion every article in the set shares, so it can narrow nothing. */
const SHAPE: AttributeFacetDto = {
  id: '30',
  label: 'Форма',
  unit: null,
  type: 'A',
  isInterval: false,
  isMandatory: true,
  role: null,
  values: [{ value: 'Кръгла', label: 'Кръгла', count: 12 }],
}

/** Enough criteria to push some past the open-on-arrival limit. */
function manyFacets(count: number): AttributeFacetDto[] {
  return Array.from({ length: count }, (_unused, index) => ({
    ...HEIGHT,
    id: `10${index}`,
    label: `Размер ${index}`,
  }))
}

function hrefOf(name: RegExp): string {
  return decodeURIComponent(
    screen.getByRole('link', { name }).getAttribute('href') ?? '',
  )
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AttributeFilters', () => {
  describe('before a leaf category is reached', () => {
    // The gate is invisible to the visitor, so the block explains what to do
    // rather than silently disappearing.
    it('asks for a category when none is selected', () => {
      render(<AttributeFilters state={newSearch({ query: 'x', mode: SearchMode.Generic })} />)

      expect(screen.getByText(/Изберете категория/)).toBeInTheDocument()
    })

    it('asks for a narrower one at a mid-level category', () => {
      render(
        <AttributeFilters
          state={leafState({ categoryHasChildren: true })}
          attributes={[HEIGHT]}
        />,
      )

      expect(screen.getByText(/по-конкретна подкатегория/)).toBeInTheDocument()
      expect(screen.queryByText('Височина')).not.toBeInTheDocument()
    })
  })

  // TecDoc defines its criteria per generic article, so one selected product
  // type is a homogeneous set on its own and the API returns the criteria block
  // for it — with or without a category. Refusing to render it here would
  // discard a block the API computed and ask for a narrowing that is not needed.
  describe('at a single product type', () => {
    it('renders the criteria with no category selected at all', () => {
      render(
        <AttributeFilters
          state={{
            ...newSearch({ query: 'филтър', mode: SearchMode.Generic }),
            productTypeId: '7',
          }}
          attributes={[HEIGHT]}
        />,
      )

      expect(screen.getByText('Височина')).toBeInTheDocument()
      expect(screen.queryByText(/Изберете категория/)).not.toBeInTheDocument()
    })

    it('renders the criteria under a category that still has children', () => {
      render(
        <AttributeFilters
          state={leafState({ categoryHasChildren: true, productTypeId: '7' })}
          attributes={[HEIGHT]}
        />,
      )

      expect(screen.getByText('Височина')).toBeInTheDocument()
      expect(
        screen.queryByText(/по-конкретна подкатегория/),
      ).not.toBeInTheDocument()
    })
  })

  describe('at a leaf category', () => {
    it('renders each criterion with its unit and value counts', () => {
      render(<AttributeFilters state={leafState()} attributes={[HEIGHT]} />)

      expect(screen.getByText('Височина')).toBeInTheDocument()
      expect(screen.getByText('mm')).toBeInTheDocument()
      expect(screen.getByText('(9)')).toBeInTheDocument()
    })

    it('adds an unselected value', () => {
      render(<AttributeFilters state={leafState()} attributes={[HEIGHT]} />)

      expect(hrefOf(/Височина 47.*добави/)).toContain('attr=20:47')
    })

    it('removes a selected value', () => {
      render(
        <AttributeFilters
          state={leafState({ attributes: [{ criteriaId: '20', value: '47' }] })}
          attributes={[HEIGHT]}
        />,
      )

      expect(hrefOf(/Височина 47.*премахни/)).not.toContain('attr=20:47')
    })

    it('clears every attribute at once', () => {
      render(
        <AttributeFilters
          state={leafState({ attributes: [{ criteriaId: '20', value: '47' }] })}
          attributes={[HEIGHT]}
        />,
      )

      expect(hrefOf(/Изчисти/)).not.toContain('attr=')
    })

    // Fitting position is what a mechanic narrows by first; raw millimetres are
    // a last resort.
    it('leads with the criteria the API gave a semantic role', () => {
      render(
        <AttributeFilters state={leafState()} attributes={[HEIGHT, FITTING_POSITION]} />,
      )

      const legends = screen.getAllByRole('group').map((group) => group.textContent)
      expect(legends[0]).toContain('Позиция на монтаж')
    })

    it('says so when the category has no criteria at all', () => {
      render(<AttributeFilters state={leafState()} attributes={[]} />)

      expect(screen.getByText(/няма технически размери/)).toBeInTheDocument()
    })

    // TecDoc's own verdict on which criteria identify the part rather than
    // merely describe one already identified.
    it('leads with the criteria TecDoc marks mandatory', () => {
      render(
        <AttributeFilters state={leafState()} attributes={[MATERIAL, HEIGHT]} />,
      )

      const groups = screen.getAllByRole('group').map((group) => group.textContent)
      expect(groups[0]).toContain('Височина')
      expect(groups[1]).toContain('Материал')
    })

    // Every article in the set already carries that one value, so selecting it
    // narrows nothing — mandatory or not, it must not take an open slot.
    it('sinks a single-value criterion even when it is mandatory', () => {
      render(
        <AttributeFilters
          state={leafState()}
          attributes={[SHAPE, MATERIAL]}
        />,
      )

      const groups = screen.getAllByRole('group').map((group) => group.textContent)
      expect(groups[0]).toContain('Материал')
      expect(groups[1]).toContain('Форма')
    })
  })

  describe('collapsing', () => {
    it('opens the first three criteria and no more', () => {
      render(<AttributeFilters state={leafState()} attributes={manyFacets(5)} />)

      const open = screen
        .getAllByRole('button', { expanded: true })
        .map((button) => button.textContent)

      expect(open).toHaveLength(3)
      expect(open[0]).toContain('Размер 0')
      expect(open[2]).toContain('Размер 2')
    })

    it('keeps the values of a closed criterion out of the DOM', () => {
      render(<AttributeFilters state={leafState()} attributes={manyFacets(5)} />)

      expect(
        screen.queryByRole('link', { name: /Размер 4 47/ }),
      ).not.toBeInTheDocument()
    })

    it('reveals them on click', async () => {
      render(<AttributeFilters state={leafState()} attributes={manyFacets(5)} />)

      await userEvent.click(screen.getByRole('button', { name: /Размер 4/ }))

      expect(
        screen.getByRole('link', { name: /Размер 4 47/ }),
      ).toBeInTheDocument()
    })

    it('closes one that opened by default', async () => {
      render(<AttributeFilters state={leafState()} attributes={manyFacets(5)} />)

      await userEvent.click(screen.getByRole('button', { name: /Размер 0/ }))

      expect(
        screen.queryByRole('link', { name: /Размер 0 47/ }),
      ).not.toBeInTheDocument()
    })

    // A filter the visitor cannot see is a filter they cannot remove, so a
    // narrowed criterion opens however far down the list it sits.
    it('opens a criterion that is already filtering, wherever it ranks', () => {
      render(
        <AttributeFilters
          state={leafState({ attributes: [{ criteriaId: '104', value: '47' }] })}
          attributes={manyFacets(5)}
        />,
      )

      expect(
        screen.getByRole('link', { name: /Размер 4 47.*премахни/ }),
      ).toBeInTheDocument()
    })

    it('counts the selections of one closed by hand', async () => {
      render(
        <AttributeFilters
          state={leafState({ attributes: [{ criteriaId: '100', value: '47' }] })}
          attributes={manyFacets(5)}
        />,
      )

      await userEvent.click(screen.getByRole('button', { name: /Размер 0/ }))

      expect(
        screen.getByRole('button', { name: /Размер 0 mm 1$/ }),
      ).toBeInTheDocument()
    })
  })

  // Landing straight on a later page — a shared link, a reload — leaves nothing
  // to retain, so "there are none" would be a guess rather than an answer.
  describe('on a later page with nothing retained', () => {
    it('offers the first page instead of claiming there are no dimensions', () => {
      render(<AttributeFilters state={leafState({ page: 3 })} />)

      expect(screen.queryByText(/няма технически размери/)).not.toBeInTheDocument()
      expect(
        screen.getByRole('link', { name: /първата страница/ }),
      ).toBeInTheDocument()
    })

    it('keeps every filter when returning to the first page', () => {
      render(
        <AttributeFilters state={leafState({ page: 3, brandIds: ['268'] })} />,
      )

      const href = decodeURIComponent(
        screen.getByRole('link', { name: /първата страница/ }).getAttribute('href') ?? '',
      )

      expect(href).toContain('brand=268')
      expect(href).toContain('cat=1052')
      expect(href).not.toContain('page=')
    })
  })

  // Only page 1 carries an attribute block; without retention the filters
  // would vanish the moment the visitor paginated.
  it('keeps the page-1 block when a later page omits it', () => {
    const { rerender } = render(
      <AttributeFilters state={leafState()} attributes={[HEIGHT]} />,
    )

    rerender(<AttributeFilters state={leafState({ page: 2 })} />)

    expect(screen.getByText('Височина')).toBeInTheDocument()
  })

  it('drops the retained block once the result set changes', () => {
    const { rerender } = render(
      <AttributeFilters state={leafState()} attributes={[HEIGHT]} />,
    )

    rerender(<AttributeFilters state={leafState({ brandIds: ['268'] })} />)

    expect(screen.queryByText('Височина')).not.toBeInTheDocument()
  })

  describe('the fitting-position diagram', () => {
    // Real TecDoc key-table-90 codes, with the zones the API resolves them to.
    const PLACED: AttributeFacetDto = {
      ...FITTING_POSITION,
      values: [
        { value: 'VA', label: 'предна ос', count: 34076, zone: 'front-axle' },
        { value: 'HA', label: 'задна ос', count: 20129, zone: 'rear-axle' },
        { value: 'FB', label: 'двустранен', count: 900 },
      ],
    }

    it('offers the placed values as zones on the car', () => {
      render(<AttributeFilters state={leafState()} attributes={[PLACED]} />)

      expect(
        screen.getByRole('link', { name: /Предна ос \(34076\)/ }),
      ).toBeInTheDocument()
    })

    it('does not also list a placed value as a chip', () => {
      render(<AttributeFilters state={leafState()} attributes={[PLACED]} />)

      expect(screen.queryByText('предна ос')).not.toBeInTheDocument()
    })

    it('keeps the values a car outline cannot hold as chips', () => {
      render(<AttributeFilters state={leafState()} attributes={[PLACED]} />)

      expect(
        screen.getByRole('link', { name: /двустранен/ }),
      ).toBeInTheDocument()
    })

    // Without a zone on any value there is nothing to draw, and the criterion
    // has to stay usable as a plain list.
    it('falls back to chips when the API placed nothing', () => {
      render(
        <AttributeFilters state={leafState()} attributes={[FITTING_POSITION]} />,
      )

      expect(screen.getByRole('link', { name: /Отпред/ })).toBeInTheDocument()
    })

    it('draws no diagram for a criterion without the role', () => {
      const zonedButRoleless: AttributeFacetDto = {
        ...PLACED,
        id: '25',
        label: 'Материал',
        role: null,
      }

      render(
        <AttributeFilters state={leafState()} attributes={[zonedButRoleless]} />,
      )

      expect(screen.getByRole('link', { name: /предна ос/ })).toBeInTheDocument()
      expect(
        screen.queryByRole('link', { name: /Предна ос \(34076\)/ }),
      ).not.toBeInTheDocument()
    })
  })
})
