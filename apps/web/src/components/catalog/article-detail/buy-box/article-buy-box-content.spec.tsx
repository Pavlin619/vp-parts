import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {
  WarehouseAvailabilityDto,
  WarehouseId,
} from '@vp-parts-shop/shared'
import { ArticleBuyBoxContent } from './article-buy-box-content'

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
    pickup: { earliestAt: '2020-01-06T08:00:00.000Z', granularity: 'DAY' },
    courier: { earliestAt: '2020-01-07T08:00:00.000Z', granularity: 'DAY' },
  }
}

const baseProps = {
  available: true,
  priceIncVat: 8420,
  priceExVat: 7017,
  fitsVehicle: null,
}

describe('ArticleBuyBoxContent — available', () => {
  it('shows the in-stock status and add-to-cart button', () => {
    render(<ArticleBuyBoxContent {...baseProps} />)
    expect(screen.getByText('Наличен в склад')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Добави в кошницата/ }),
    ).toBeInTheDocument()
  })

  it('shows both the VAT-inclusive and VAT-exclusive price hints', () => {
    render(<ArticleBuyBoxContent {...baseProps} />)
    expect(screen.getByText(/с ДДС/)).toBeInTheDocument()
    expect(screen.getByText(/без ДДС/)).toBeInTheDocument()
  })

  it('names the fastest warehouse and its own stock in the headline', () => {
    render(
      <ArticleBuyBoxContent
        {...baseProps}
        availabilityByWarehouse={[
          warehouse('CENTRAL', 4),
          warehouse('ROMANIA', 5),
        ]}
      />,
    )

    expect(screen.getByTestId('availability-headline')).toHaveTextContent(
      'Наличен в Централен склад · 4 бр.',
    )
    // The 5 units in Romania must NOT inflate the headline count.
    expect(screen.queryByText(/9 бр\./)).not.toBeInTheDocument()
  })

  it('increments and decrements the quantity within bounds', async () => {
    const user = userEvent.setup()
    render(<ArticleBuyBoxContent {...baseProps} />)

    const quantity = screen.getByLabelText('Количество')
    expect(quantity).toHaveTextContent('1')

    // Cannot go below 1
    await user.click(screen.getByLabelText('Намали количеството'))
    expect(quantity).toHaveTextContent('1')

    await user.click(screen.getByLabelText('Увеличи количеството'))
    await user.click(screen.getByLabelText('Увеличи количеството'))
    expect(quantity).toHaveTextContent('3')
  })

  it('caps the quantity at the total stock across all warehouses', async () => {
    const user = userEvent.setup()
    render(
      <ArticleBuyBoxContent
        {...baseProps}
        availabilityByWarehouse={[
          warehouse('CENTRAL', 2),
          warehouse('REGIONAL_1', 1),
        ]}
      />,
    )

    const quantity = screen.getByLabelText('Количество')
    const increment = screen.getByLabelText('Увеличи количеството')

    // Total stock is 3 (2 + 1); the stepper must stop there.
    await user.click(increment)
    await user.click(increment)
    expect(quantity).toHaveTextContent('3')

    await user.click(increment)
    expect(quantity).toHaveTextContent('3')
    expect(increment).toBeDisabled()
  })

  it('clamps the selection down when a refresh shrinks available stock', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <ArticleBuyBoxContent
        {...baseProps}
        availabilityByWarehouse={[warehouse('CENTRAL', 5)]}
      />,
    )

    const increment = screen.getByLabelText('Увеличи количеството')
    await user.click(increment)
    await user.click(increment)
    await user.click(increment)
    await user.click(increment)
    expect(screen.getByLabelText('Количество')).toHaveTextContent('5')

    // A re-validation shrinks stock to 2; the shown selection must clamp down.
    rerender(
      <ArticleBuyBoxContent
        {...baseProps}
        availabilityByWarehouse={[warehouse('CENTRAL', 2)]}
      />,
    )

    expect(screen.getByLabelText('Количество')).toHaveTextContent('2')
  })

  it('calls onAddToCart with the chosen quantity', async () => {
    const user = userEvent.setup()
    const onAddToCart = jest.fn()
    render(<ArticleBuyBoxContent {...baseProps} onAddToCart={onAddToCart} />)

    await user.click(screen.getByLabelText('Увеличи количеството'))
    await user.click(screen.getByRole('button', { name: /Добави в кошницата/ }))

    expect(onAddToCart).toHaveBeenCalledWith(2)
  })

  it('shows a fit panel when the part fits the selected vehicle', () => {
    render(
      <ArticleBuyBoxContent
        {...baseProps}
        fitsVehicle={true}
        vehicleName="AUDI A3 2.0 TDI"
      />,
    )
    expect(screen.getByText('Пасва на твоя автомобил')).toBeInTheDocument()
    expect(screen.getByText('AUDI A3 2.0 TDI')).toBeInTheDocument()
  })
})

describe('ArticleBuyBoxContent — not deliverable but priced', () => {
  it('still shows the price, marks it sold out, and hides the delivery module', () => {
    render(
      <ArticleBuyBoxContent
        {...baseProps}
        available={false}
        availabilityByWarehouse={[]}
      />,
    )

    // We know the price, so it stays visible even though we can't deliver.
    expect(screen.getByText(/с ДДС/)).toBeInTheDocument()
    // A part we normally carry but hold none of reads "Изчерпан".
    expect(screen.getByLabelText('Изчерпан')).toBeInTheDocument()

    // Nothing purchasable and no delivery promise we can't keep.
    expect(
      screen.queryByRole('button', { name: /Добави в кошницата/ }),
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Количество')).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('delivery-estimate-chip-courier'),
    ).not.toBeInTheDocument()
  })
})

describe('ArticleBuyBoxContent — no inventory data', () => {
  it('marks the part unavailable, shows no price, and hides everything else', () => {
    render(
      <ArticleBuyBoxContent {...baseProps} available={false} priceIncVat={null} />,
    )

    // No pricing/stock data: a neutral "not available" label, no price hint.
    expect(screen.getByLabelText('Не е наличен')).toBeInTheDocument()
    expect(screen.queryByText(/с ДДС/)).not.toBeInTheDocument()

    expect(
      screen.queryByRole('button', { name: /Добави в кошницата/ }),
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Количество')).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('delivery-estimate-chip-courier'),
    ).not.toBeInTheDocument()
  })
})
