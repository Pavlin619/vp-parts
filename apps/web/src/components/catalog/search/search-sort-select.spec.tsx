import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchSort, type SearchOrdering } from '@vp-parts-shop/shared'
import { parseSearchUrl, type SearchUrlState } from '@/lib/catalog/search-url'
import { SearchSortSelect } from './search-sort-select'

const push = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

function renderSelect({
  params = {},
  ordering = SearchSort.Availability,
  isRankable = true,
}: {
  params?: Record<string, string>
  ordering?: SearchOrdering
  isRankable?: boolean
} = {}) {
  const state: SearchUrlState = parseSearchUrl({ q: 'WL634', ...params })

  return render(
    <SearchSortSelect
      state={state}
      ordering={ordering}
      isRankable={isRankable}
    />,
  )
}

function trigger(): HTMLElement {
  return screen.getByRole('button', { expanded: false })
}

async function open() {
  await userEvent.click(trigger())
}

async function choose(label: RegExp) {
  await userEvent.click(screen.getByRole('option', { name: label }))
}

/**
 * The label and its direction hint are separate elements, so the joined text
 * runs them together. Matched rather than compared for exactly that reason.
 */
function optionLabels(): string[] {
  return screen.getAllByRole('option').map((option) => option.textContent ?? '')
}

function selectedLabel(): string {
  const selected = screen
    .getAllByRole('option')
    .find((option) => option.getAttribute('aria-selected') === 'true')

  return selected?.textContent ?? ''
}

describe('SearchSortSelect', () => {
  beforeEach(() => {
    push.mockReset()
  })

  it('keeps the list closed until it is asked for', () => {
    renderSelect()

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('offers every order over a set that can be ranked', async () => {
    renderSelect()
    await open()

    expect(optionLabels()).toEqual([
      expect.stringMatching(/^Наличност/),
      expect.stringMatching(/^Цена.*ниска → висока/),
      expect.stringMatching(/^Цена.*висока → ниска/),
      expect.stringMatching(/^Производител/),
      expect.stringMatching(/^Номер на артикул/),
      expect.stringMatching(/^По съвпадение/),
    ])
  })

  /**
   * A set too wide to enumerate has no stock behind it to rank on, so offering
   * these two would be offering an order we would silently not apply.
   */
  it('withholds the orders a wide set cannot be served in', async () => {
    renderSelect({ ordering: SearchSort.Catalogue, isRankable: false })
    await open()

    expect(optionLabels()).toEqual([
      expect.stringMatching(/^Производител/),
      expect.stringMatching(/^Номер на артикул/),
      expect.stringMatching(/^По съвпадение/),
    ])
  })

  // The two price rows differ only by direction, so the hint is the whole
  // distinction between them rather than decoration on the label.
  it('names the direction of each price order', async () => {
    renderSelect()
    await open()

    expect(screen.getByRole('option', { name: /ниска → висока/ })).toBeVisible()
    expect(screen.getByRole('option', { name: /висока → ниска/ })).toBeVisible()
  })

  it('shows the order asked for as the selected one', async () => {
    renderSelect({
      params: { sort: SearchSort.PriceDescending },
      ordering: SearchSort.PriceDescending,
    })
    await open()

    expect(selectedLabel()).toMatch(/висока → ниска/)
  })

  /**
   * The applied order, not the requested one. A wide set asked for price is
   * served in catalogue order, and a control still reading "cheapest first"
   * over a list that is not would be the one lie this whole contract exists to
   * prevent.
   */
  it('shows the fallback order when the one asked for could not be applied', async () => {
    renderSelect({
      params: { sort: SearchSort.PriceAscending },
      ordering: SearchSort.Catalogue,
      isRankable: false,
    })
    await open()

    expect(selectedLabel()).toMatch(/^По съвпадение/)
  })

  it('names the applied order on the closed control', () => {
    renderSelect({
      params: { sort: SearchSort.Brand },
      ordering: SearchSort.Brand,
    })

    expect(trigger()).toHaveTextContent(/Производител/)
  })

  it('navigates to the chosen order', async () => {
    renderSelect()
    await open()
    await choose(/ниска → висока/)

    expect(push).toHaveBeenCalledWith(
      expect.stringContaining(`sort=${SearchSort.PriceAscending}`),
    )
  })

  // The list describes the order it was opened over; leaving it up covers the
  // results it was just used to re-order.
  it('closes once an order is chosen', async () => {
    renderSelect()
    await open()
    await choose(/^Производител/)

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('closes on Escape without navigating', async () => {
    renderSelect()
    await open()
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it('closes when the click lands outside it', async () => {
    renderSelect()
    await open()
    await userEvent.click(document.body)

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  // The default needs no param: two equivalent searches must produce one URL.
  it('drops the param entirely when the default is chosen', async () => {
    renderSelect({
      params: { sort: SearchSort.Brand },
      ordering: SearchSort.Brand,
    })
    await open()
    await choose(/^Наличност/)

    expect(push).toHaveBeenCalledWith(expect.not.stringContaining('sort='))
  })

  // Re-ordering moves the rows rather than merely shrinking the list, so the
  // page the visitor was on describes nothing in the new order.
  it('returns to the first page', async () => {
    renderSelect({ params: { page: '4' } })
    await open()
    await choose(/^Производител/)

    expect(push).toHaveBeenCalledWith(expect.not.stringContaining('page='))
  })

  // An order is not a narrowing: re-picking a brand after sorting by price is
  // exactly the friction this control exists to remove.
  it('keeps the filters it was rendered with', async () => {
    renderSelect({ params: { brand: '268', stock: 'central' } })
    await open()
    await choose(/^Производител/)

    const [href] = push.mock.calls[0]
    expect(href).toContain('brand=268')
    expect(href).toContain('stock=central')
  })

  it('labels the list for assistive technology', async () => {
    renderSelect()
    await open()

    expect(screen.getByRole('listbox', { name: 'Подредба' })).toBeVisible()
  })
})
