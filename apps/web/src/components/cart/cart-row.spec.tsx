import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {
  ArticleInventoryDetailDto,
  WarehouseAvailabilityDto,
  WarehouseId,
} from '@vp-parts-shop/shared'
import type { CartLine } from '@/hooks/use-cart'
import type { CartRowModel } from '@/lib/cart/cart-totals'
import { CartRow } from './cart-row'

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    brandId: '268',
    articleNumber: 'WL6340',
    brandName: 'WIX',
    brandLogoUrl: null,
    description: 'Маслен филтър',
    thumbnailUrl: null,
    quantity: 2,
    isSelected: true,
    addedAtPriceIncVat: null,
    ...overrides,
  }
}

function warehouse(
  warehouseId: WarehouseId,
  quantity: number,
): WarehouseAvailabilityDto {
  return {
    warehouseId,
    quantity,
    deliveryWorkDays: 0,
    orderCutoffTime: '18:00',
    cutoffAt: '2099-06-25T15:00:00.000Z',
    pickup: { earliestAt: '2099-06-26T08:00:00.000Z', granularity: 'DAY' },
    courier: { earliestAt: '2099-06-27T08:00:00.000Z', granularity: 'DAY' },
  }
}

function detail(
  overrides: Partial<ArticleInventoryDetailDto> = {},
): ArticleInventoryDetailDto {
  return {
    available: true,
    bestPriceExVat: 1000,
    bestPriceIncVat: 1200,
    availabilityByWarehouse: [warehouse('CENTRAL', 4)],
    computedAt: null,
    ...overrides,
  }
}

function row(overrides: Partial<CartRowModel> = {}): CartRowModel {
  const item = overrides.line ?? line()

  return {
    line: item,
    availability: detail(),
    unitPriceExVat: 1000,
    unitPriceIncVat: 1200,
    lineTotalExVat: 1000 * item.quantity,
    lineTotalIncVat: 1200 * item.quantity,
    issue: null,
    availableQuantity: 4,
    maxQuantity: 4,
    priceChange: null,
    ...overrides,
  }
}

function renderRow(model: CartRowModel, props: Partial<Parameters<typeof CartRow>[0]> = {}) {
  return render(
    <CartRow
      row={model}
      onQuantityChange={props.onQuantityChange ?? jest.fn()}
      onToggleSelected={props.onToggleSelected ?? jest.fn()}
      onRemove={props.onRemove ?? jest.fn()}
    />,
  )
}

describe('CartRow', () => {
  it('names the part and links it to its detail page', () => {
    renderRow(row())

    expect(screen.getByRole('link', { name: 'WL6340' })).toHaveAttribute(
      'href',
      '/catalog/articles/268/WL6340',
    )
    expect(screen.getByText('Маслен филтър')).toBeInTheDocument()
    expect(screen.getByText('WIX')).toBeInTheDocument()
  })

  it('shows the unit price and the line total', () => {
    renderRow(row())

    expect(screen.getByText('12,00 €')).toBeInTheDocument()
    expect(screen.getByText('24,00 €')).toBeInTheDocument()
  })

  it('raises and lowers the stored quantity', async () => {
    const user = userEvent.setup()
    const onQuantityChange = jest.fn()

    renderRow(row(), { onQuantityChange })

    await user.click(
      screen.getByRole('button', { name: 'Увеличи количеството за WL6340' }),
    )
    expect(onQuantityChange).toHaveBeenCalledWith(3)

    await user.click(
      screen.getByRole('button', { name: 'Намали количеството за WL6340' }),
    )
    expect(onQuantityChange).toHaveBeenLastCalledWith(1)
  })

  it('stops the stepper at the stock ceiling', () => {
    renderRow(
      row({
        line: line({ quantity: 4 }),
        lineTotalExVat: 4000,
        lineTotalIncVat: 4800,
      }),
    )

    expect(
      screen.getByRole('button', { name: 'Увеличи количеството за WL6340' }),
    ).toBeDisabled()
  })

  // A cart outlives the stock it was built against. The quantity the customer
  // chose stays on screen — silently rewriting it would hide the problem rather
  // than hand them something to act on.
  it('warns that a line runs deeper than the stock, keeping the chosen quantity', () => {
    renderRow(
      row({
        line: line({ quantity: 5 }),
        issue: 'insufficient-stock',
        availableQuantity: 2,
        maxQuantity: 2,
      }),
    )

    expect(screen.getByText('Налични са само 2 бр.')).toBeInTheDocument()
    expect(screen.getByLabelText('Количество за WL6340')).toHaveTextContent('5')
    expect(
      screen.getByRole('button', { name: 'Увеличи количеството за WL6340' }),
    ).toBeDisabled()
  })

  it('warns that a line is no longer stocked at all', () => {
    renderRow(row({ issue: 'unavailable', availableQuantity: 0, maxQuantity: 0 }))

    expect(screen.getByText('Артикулът вече не е наличен.')).toBeInTheDocument()
  })

  it('says nothing about a line the live read is happy with', () => {
    renderRow(row())

    expect(screen.queryByTestId('cart-row-issue')).not.toBeInTheDocument()
  })

  it('removes the line', async () => {
    const user = userEvent.setup()
    const onRemove = jest.fn()

    renderRow(row(), { onRemove })

    await user.click(
      screen.getByRole('button', { name: 'Премахни WL6340 от кошницата' }),
    )

    expect(onRemove).toHaveBeenCalled()
  })

  it('skeletons the money columns while availability is in flight', () => {
    renderRow(
      row({
        availability: undefined,
        unitPriceExVat: null,
        unitPriceIncVat: null,
        lineTotalExVat: null,
        lineTotalIncVat: null,
      }),
    )

    expect(screen.getAllByTestId('cart-row-price-skeleton')).toHaveLength(2)
  })

  // A price we could not read must never render as a zero, which in a cart
  // reads as "free".
  it('dashes the money columns when the read gave no price', () => {
    renderRow(
      row({
        availability: null,
        unitPriceExVat: null,
        unitPriceIncVat: null,
        lineTotalExVat: null,
        lineTotalIncVat: null,
      }),
    )

    expect(screen.getAllByText('—')).toHaveLength(2)
    expect(screen.getByText('Няма данни')).toBeInTheDocument()
  })

  it('says so when the part is no longer available', () => {
    renderRow(
      row({
        availability: detail({ available: false, availabilityByWarehouse: [] }),
      }),
    )

    expect(screen.getByText('няма налично')).toBeInTheDocument()
  })

  it('offers the warehouse breakdown under the delivery promise', () => {
    renderRow(row())

    expect(
      screen.getByRole('button', { name: /4 бр. · Централен склад/ }),
    ).toBeInTheDocument()
  })

  it('toggles whether the line is part of the order', async () => {
    const user = userEvent.setup()
    const onToggleSelected = jest.fn()

    renderRow(row(), { onToggleSelected })

    await user.click(screen.getByRole('checkbox', { name: 'Избери WL6340' }))

    expect(onToggleSelected).toHaveBeenCalled()
  })

  it('shows a deselected line as unchecked', () => {
    renderRow(row({ line: line({ isSelected: false }) }))

    expect(screen.getByRole('checkbox', { name: 'Избери WL6340' })).not.toBeChecked()
  })

  // The column names above the list are a sibling grid with nothing tying them
  // to these cells, so the table layout takes the in-row labels out of sight
  // rather than out of the accessibility tree — otherwise the line reads as
  // four bare numbers.
  it('keeps every cell label readable once the line lays out as a table', () => {
    const { container } = renderRow(row())

    expect(screen.getByText('Количество')).toBeInTheDocument()
    expect(container.querySelector('article > div')).toHaveClass(
      '@cart-wide:[&_[data-cell-label]]:sr-only',
    )
  })
})

// The price shown is always today's. The note exists so a customer who
// remembers a different number is not left wondering what happened.
describe('CartRow — a price that moved since the part went in', () => {
  it('says how much dearer it got', () => {
    renderRow(row({ priceChange: 500 }))

    expect(screen.getByText(/по-скъпо от добавянето/)).toBeInTheDocument()
  })

  it('says how much cheaper it got', () => {
    renderRow(row({ priceChange: -500 }))

    expect(screen.getByText(/по-евтино от добавянето/)).toBeInTheDocument()
  })

  it('still shows the live price beside the note', () => {
    renderRow(row({ priceChange: 500, unitPriceIncVat: 1200 }))

    expect(screen.getAllByText('12,00 €').length).toBeGreaterThan(0)
  })

  it('says nothing when the price has not moved', () => {
    renderRow(row({ priceChange: null }))

    expect(screen.queryByText(/от добавянето/)).not.toBeInTheDocument()
  })
})
