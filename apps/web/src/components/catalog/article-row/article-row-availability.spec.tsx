import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {
  ArticleInventoryDetailDto,
  WarehouseAvailabilityDto,
  WarehouseId,
} from '@vp-parts-shop/shared'
import { ArticleRowAvailability } from './article-row-availability'

function warehouse(
  warehouseId: WarehouseId,
  quantity: number,
  deliveryWorkDays = 0,
): WarehouseAvailabilityDto {
  return {
    warehouseId,
    quantity,
    deliveryWorkDays,
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
    bestPriceExVat: 1250,
    bestPriceIncVat: 1500,
    availabilityByWarehouse: [],
    computedAt: null,
    ...overrides,
  }
}

function renderCells(
  availability: ArticleInventoryDetailDto | null | undefined,
) {
  return render(
    <ArticleRowAvailability
      availability={availability}
      articleNumber="WL6340"
      articleName="Маслен филтър"
      quantity={1}
    />,
  )
}

describe('ArticleRowAvailability — pending', () => {
  it('renders skeletons while the availability read is in flight', () => {
    renderCells(undefined)

    expect(
      screen.getByTestId('article-row-delivery-skeleton'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('article-row-stock-skeleton')).toBeInTheDocument()
  })

  it('does not claim a delivery promise while pending', () => {
    renderCells(undefined)

    expect(screen.queryByText(/работен ден/)).not.toBeInTheDocument()
    expect(screen.queryByText('няма налично')).not.toBeInTheDocument()
  })
})

describe('ArticleRowAvailability — failed read', () => {
  it('shows a neutral unknown state rather than "out of stock"', () => {
    renderCells(null)

    expect(screen.getByText('Няма данни')).toBeInTheDocument()
    expect(screen.queryByText('няма налично')).not.toBeInTheDocument()
    expect(screen.queryByText('Под поръчка')).not.toBeInTheDocument()
  })
})

describe('ArticleRowAvailability — resolved', () => {
  it('shows the fastest warehouse stock, name and delivery band', () => {
    renderCells(
      detail({
        availabilityByWarehouse: [
          warehouse('REGIONAL_1', 7, 1),
          warehouse('POLAND', 4, 3),
        ],
      }),
    )

    expect(screen.getByText('7 бр.')).toBeInTheDocument()
    expect(screen.getByText('Регионален склад 1')).toBeInTheDocument()
    expect(screen.getByText('за 1 работен ден')).toBeInTheDocument()
  })

  it('rolls the remaining warehouses into the breakdown trigger', () => {
    renderCells(
      detail({
        availabilityByWarehouse: [
          warehouse('CENTRAL', 3),
          warehouse('REGIONAL_1', 5, 1),
          warehouse('POLAND', 6, 3),
        ],
      }),
    )

    expect(
      screen.getByRole('button', { name: /Складове \+11 бр\./ }),
    ).toBeInTheDocument()
  })

  it('opens the per-warehouse breakdown from the stock cell', async () => {
    const user = userEvent.setup()
    renderCells(
      detail({
        availabilityByWarehouse: [
          warehouse('CENTRAL', 3),
          warehouse('REGIONAL_1', 5, 1),
        ],
      }),
    )

    await user.click(screen.getByRole('button', { name: /Складове/ }))

    expect(
      screen.getByRole('heading', { name: 'Наличност по складове' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Маслен филтър · WL6340')).toBeInTheDocument()
  })

  it('keeps a positive headline when no warehouse breakdown is sent', () => {
    renderCells(detail({ availabilityByWarehouse: [] }))

    expect(screen.getByText('Наличен в склад')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Складове/ }),
    ).not.toBeInTheDocument()
  })

  // A summary-only payload says the part is purchasable, not how fast it ships.
  it('promises no delivery date when no warehouse breakdown is sent', () => {
    renderCells(detail({ availabilityByWarehouse: [] }))

    expect(screen.getByText('в наличност')).toBeInTheDocument()
    expect(screen.queryByText('за днес')).not.toBeInTheDocument()
  })

  it('shows the delivery band as soon as one warehouse is known', () => {
    renderCells(
      detail({ availabilityByWarehouse: [warehouse('CENTRAL', 2)] }),
    )

    expect(screen.getByText('за днес')).toBeInTheDocument()
    expect(screen.queryByText('в наличност')).not.toBeInTheDocument()
  })

  it('shows the out-of-stock chip when the article is not available', () => {
    renderCells(detail({ available: false, bestPriceIncVat: null }))

    expect(screen.getByText('няма налично')).toBeInTheDocument()
    expect(screen.getByText('Под поръчка')).toBeInTheDocument()
  })
})

// Both cells are labelled in every state, including the ones that render a bare
// chip or a bare count. They sit side by side in the stacked mobile layout,
// where "за днес" next to "1 бр." is two unexplained values without them.
describe('ArticleRowAvailability — the column labels', () => {
  const states: [string, ArticleInventoryDetailDto | null | undefined][] = [
    ['pending', undefined],
    ['failed', null],
    ['in stock', detail({ availabilityByWarehouse: [warehouse('CENTRAL', 2)] })],
    ['summary only', detail({ availabilityByWarehouse: [] })],
    ['unavailable', detail({ available: false })],
  ]

  it.each(states)('labels both columns in the %s state', (_, availability) => {
    renderCells(availability)

    expect(screen.getByText('Доставка')).toBeInTheDocument()
    expect(screen.getByText('Наличност')).toBeInTheDocument()
  })
})
