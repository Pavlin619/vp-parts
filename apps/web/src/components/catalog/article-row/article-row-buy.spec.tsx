import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ArticleInventoryDetailDto } from '@vp-parts-shop/shared'
import { usePriceDisplay } from '@/hooks/use-price-display'
import type { BuyBoxQuantity } from '@/hooks/use-buy-box-quantity'
import { ArticleRowBuy } from './article-row-buy'

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

function quantityControl(
  overrides: Partial<BuyBoxQuantity> = {},
): BuyBoxQuantity {
  return {
    selectedQuantity: 1,
    maxQuantity: 10,
    changeQuantity: jest.fn(),
    ...overrides,
  }
}

function renderBuy(
  availability: ArticleInventoryDetailDto | null | undefined,
  overrides: {
    quantity?: BuyBoxQuantity
    onAddToCart?: (quantity: number) => void
  } = {},
) {
  return render(
    <ArticleRowBuy
      availability={availability}
      quantity={overrides.quantity ?? quantityControl()}
      articleName="Маслен филтър"
      onAddToCart={overrides.onAddToCart}
    />,
  )
}

beforeEach(() => {
  usePriceDisplay.setState({ includesVat: true })
})

describe('ArticleRowBuy — pending', () => {
  it('renders a skeleton instead of a price while the read is in flight', () => {
    renderBuy(undefined)

    expect(screen.getByTestId('article-row-buy-skeleton')).toBeInTheDocument()
    expect(screen.queryByText(/15[.,]00/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /кошницата/ }),
    ).not.toBeInTheDocument()
  })
})

describe('ArticleRowBuy — resolved', () => {
  it('shows the VAT-inclusive price and its unit hint', () => {
    renderBuy(detail())

    expect(screen.getByText(/15[.,]00/)).toBeInTheDocument()
    expect(screen.getByText('с ДДС · за брой')).toBeInTheDocument()
  })

  it('adds the selected quantity to the cart', async () => {
    const user = userEvent.setup()
    const onAddToCart = jest.fn()
    renderBuy(detail(), {
      quantity: quantityControl({ selectedQuantity: 3 }),
      onAddToCart,
    })

    await user.click(
      screen.getByRole('button', { name: 'Добави Маслен филтър в кошницата' }),
    )

    expect(onAddToCart).toHaveBeenCalledWith(3)
  })

  it('steps the quantity through the shared control', async () => {
    const user = userEvent.setup()
    const changeQuantity = jest.fn()
    renderBuy(detail(), { quantity: quantityControl({ changeQuantity }) })

    await user.click(
      screen.getByRole('button', { name: 'Увеличи количеството' }),
    )

    expect(changeQuantity).toHaveBeenCalledWith(1)
  })

  it('disables decrement at one and increment at the stock ceiling', () => {
    renderBuy(detail(), {
      quantity: quantityControl({ selectedQuantity: 1, maxQuantity: 1 }),
    })

    expect(
      screen.getByRole('button', { name: 'Намали количеството' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Увеличи количеството' }),
    ).toBeDisabled()
  })

  it('shows the price but no buy actions when the article is unavailable', () => {
    renderBuy(detail({ available: false }))

    expect(screen.getByText(/15[.,]00/)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /кошницата/ }),
    ).not.toBeInTheDocument()
  })

  it('shows a dash when the read failed', () => {
    renderBuy(null)

    expect(screen.getByText('—')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /кошницата/ }),
    ).not.toBeInTheDocument()
  })
})

// In a wide row the buy column is the tallest cell, so its height is the row's.
// A state reserving less would leave a back-ordered part — or one whose price
// has not landed yet — visibly shorter than the row above it.
describe('ArticleRowBuy — the row height it pins', () => {
  const states: [string, ArticleInventoryDetailDto | null | undefined][] = [
    ['pending', undefined],
    ['buyable', detail()],
    ['unavailable', detail({ available: false })],
    ['failed', null],
  ]

  it.each(states)('reserves the full height in the %s state', (_, availability) => {
    renderBuy(availability)

    expect(screen.getByTestId('article-row-buy')).toHaveClass('@row-wide:min-h-[88px]')
  })

  // In a narrow row it is a band across the bottom of the card rather than the
  // last of two columns, so it has to clear the grid the delivery and stock
  // cells share — otherwise the price lands beside them and the actions wrap.
  it.each(states)('spans the whole band in the %s state', (_, availability) => {
    renderBuy(availability)

    expect(screen.getByTestId('article-row-buy')).toHaveClass(
      'col-span-2',
      '@row-wide:col-span-1',
    )
  })
})

describe('ArticleRowBuy — the VAT preference', () => {
  it('shows the net price and says so when VAT is switched off', () => {
    usePriceDisplay.setState({ includesVat: false })
    renderBuy(detail())

    expect(screen.getByText(/12[.,]50/)).toBeInTheDocument()
    expect(screen.getByText('без ДДС · за брой')).toBeInTheDocument()
    expect(screen.queryByText(/15[.,]00/)).not.toBeInTheDocument()
  })

  it('follows the preference changing under it', () => {
    renderBuy(detail())
    expect(screen.getByText(/15[.,]00/)).toBeInTheDocument()

    act(() => usePriceDisplay.getState().setIncludesVat(false))

    expect(screen.getByText(/12[.,]50/)).toBeInTheDocument()
  })

  it('falls back to a dash when the preferred price is missing', () => {
    usePriceDisplay.setState({ includesVat: false })
    renderBuy(detail({ bestPriceExVat: null }))

    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
