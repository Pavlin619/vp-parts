import { render, screen } from '@testing-library/react'
import type {
  ArticleInventoryDetailDto,
  WarehouseAvailabilityDto,
  WarehouseId,
} from '@vp-parts-shop/shared'
import { CartRowDelivery } from './cart-row-delivery'

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
    bestPriceExVat: 1000,
    bestPriceIncVat: 1200,
    availabilityByWarehouse: [warehouse('CENTRAL', 4)],
    computedAt: null,
    ...overrides,
  }
}

function renderDelivery(
  availability: ArticleInventoryDetailDto | null | undefined,
  quantity = 2,
) {
  return render(
    <CartRowDelivery
      availability={availability}
      articleNumber="WL6340"
      articleName="Маслен филтър"
      quantity={quantity}
    />,
  )
}

describe('CartRowDelivery', () => {
  it('promises a speed and offers the warehouse breakdown under it', () => {
    renderDelivery(detail())

    expect(screen.getByText('за днес')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /4 бр. · Централен склад/ }),
    ).toBeInTheDocument()
  })

  // The stock figure is the label on the link now, so the cap has to survive
  // the move out of its own column.
  it('caps the stock figure on the link', () => {
    renderDelivery(
      detail({ availabilityByWarehouse: [warehouse('CENTRAL', 24)] }),
    )

    expect(
      screen.getByRole('button', { name: /9\+ бр. · Централен склад/ }),
    ).toBeInTheDocument()
  })

  it('names the slower band when the fastest warehouse is a day out', () => {
    renderDelivery(
      detail({ availabilityByWarehouse: [warehouse('PLOVDIV' as WarehouseId, 3, 1)] }),
    )

    expect(screen.getByText('за 1 работен ден')).toBeInTheDocument()
  })

  // The line ships as one parcel, so a quantity the fastest warehouse cannot
  // cover on its own is a slower promise — and the link has to name the
  // warehouse the chip is quoting, not a faster one we would not ship from.
  it('slows the promise once the line outgrows the fastest warehouse', () => {
    renderDelivery(
      detail({
        availabilityByWarehouse: [
          warehouse('CENTRAL', 1),
          warehouse('REGIONAL_1', 5, 1),
        ],
      }),
    )

    expect(screen.getByText('за 1 работен ден')).toBeInTheDocument()
    expect(screen.queryByText('за днес')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /5 бр. · Регионален склад 1/ }),
    ).toBeInTheDocument()
  })

  it('keeps the fastest warehouse when it covers the line on its own', () => {
    renderDelivery(
      detail({
        availabilityByWarehouse: [
          warehouse('CENTRAL', 1),
          warehouse('REGIONAL_1', 5, 1),
        ],
      }),
      1,
    )

    expect(screen.getByText('за днес')).toBeInTheDocument()
  })

  it('says the part is out rather than promising a date', () => {
    renderDelivery(detail({ available: false, availabilityByWarehouse: [] }))

    expect(screen.getByText('няма налично')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  // In stock, but the payload says nothing about how fast it ships.
  it('claims no speed without a per-warehouse breakdown', () => {
    renderDelivery(detail({ availabilityByWarehouse: [] }))

    expect(screen.getByText('в наличност')).toBeInTheDocument()
  })

  it('skeletons while the read is in flight', () => {
    renderDelivery(undefined)

    expect(screen.getByTestId('cart-row-delivery-skeleton')).toBeInTheDocument()
  })

  // A transient inventory outage must not read as a verdict on the part.
  it('says nothing is known when the read failed', () => {
    renderDelivery(null)

    expect(screen.getByText('Няма данни')).toBeInTheDocument()
    expect(screen.queryByText('няма налично')).not.toBeInTheDocument()
  })
})
