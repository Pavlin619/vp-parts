import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {
  ArticleInventoryDetailDto,
  ArticleSummaryDto,
  WarehouseAvailabilityDto,
  WarehouseId,
} from '@vp-parts-shop/shared'
import { MAX_CART_LINES, useCart } from '@/hooks/use-cart'
import { ArticleRow } from './article-row'

function article(
  overrides: Partial<ArticleSummaryDto> = {},
): ArticleSummaryDto {
  return {
    articleNumber: 'WL6340',
    brandId: '268',
    brandName: 'WIX',
    brandLogoUrl: null,
    description: 'Маслен филтър',
    thumbnailUrl: null,
    technicalSpecs: [{ key: 'Височина', value: '79 mm' }],
    fitsVehicle: null,
    ...overrides,
  }
}

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
    availabilityByWarehouse: [warehouse('CENTRAL', 4)],
    computedAt: null,
    ...overrides,
  }
}

describe('ArticleRow — catalog metadata', () => {
  it('renders the identity straight from the catalog response', () => {
    render(<ArticleRow article={article()} />)

    expect(screen.getByRole('link', { name: 'WL6340' })).toBeInTheDocument()
    expect(screen.getByText('Маслен филтър')).toBeInTheDocument()
    expect(screen.getByText('WIX')).toBeInTheDocument()
  })

  // Counter staff paste these into supplier systems all day, so the number is
  // copyable from the list without opening the part.
  it('copies the article number to the clipboard', async () => {
    const user = userEvent.setup()
    render(<ArticleRow article={article()} />)

    await user.click(
      screen.getByRole('button', { name: 'Копирай номер WL6340' }),
    )

    expect(await navigator.clipboard.readText()).toBe('WL6340')
  })

  // A logo is a mark, not a name, and the row has no room to print one beside it.
  it('names the brand in a tooltip on its logo', async () => {
    const user = userEvent.setup()
    render(
      <ArticleRow
        article={article({ brandLogoUrl: 'https://img.example/wix.png' })}
      />,
    )

    // The mark is the only thing rendered for the brand, so the name is not on
    // screen until the tooltip opens.
    expect(screen.queryByText('WIX')).not.toBeInTheDocument()

    await user.hover(screen.getByAltText('WIX'))

    expect(await screen.findByText('WIX')).toBeInTheDocument()
  })

  it('summarises the technical specs under the description', () => {
    render(
      <ArticleRow
        article={article({
          technicalSpecs: [
            { key: 'Височина', value: '79 mm' },
            { key: 'Външен диаметър', value: '93 mm' },
          ],
        })}
      />,
    )

    expect(
      screen.getByText('Височина: 79 mm · Външен диаметър: 93 mm'),
    ).toBeInTheDocument()
  })

  it('links to the article detail page', () => {
    render(<ArticleRow article={article()} />)

    expect(screen.getByRole('link', { name: 'WL6340' })).toHaveAttribute(
      'href',
      '/catalog/articles/268/WL6340',
    )
  })

  // TecDoc files one part under several category trails, so the detail page's
  // breadcrumb can only continue the one the visitor drilled if the list says
  // which that was.
  it('carries the category the list is standing in into the article link', () => {
    render(<ArticleRow article={article()} categoryNodeId="100259" />)

    expect(screen.getByRole('link', { name: 'WL6340' })).toHaveAttribute(
      'href',
      '/catalog/articles/268/WL6340?categoryId=100259',
    )
  })

  it('URL-encodes special characters in the article link', () => {
    render(<ArticleRow article={article({ articleNumber: 'BD 0986/451' })} />)

    expect(
      screen.getByRole('link', { name: 'BD 0986/451' }),
    ).toHaveAttribute('href', `/catalog/articles/268/${encodeURIComponent('BD 0986/451')}`)
  })

  // Fit is an article-detail concern; the row stays vehicle-agnostic even when
  // the catalog metadata carries a verdict.
  it('never renders a vehicle fit verdict', () => {
    const { rerender } = render(
      <ArticleRow article={article({ fitsVehicle: true })} />,
    )
    expect(screen.queryByText(/подходяща за/i)).not.toBeInTheDocument()

    rerender(<ArticleRow article={article({ fitsVehicle: false })} />)
    expect(screen.queryByText(/подходяща за/i)).not.toBeInTheDocument()
  })
})

// A thumbnail or logo URL can 404, be served by a host that is not registered
// in `next.config.ts`, or simply fail on a flaky CDN. The row must degrade to
// the placeholder it already has rather than leave a broken image box.
// TecDoc photos are white-backed and rarely square, so `object-contain` leaves
// the slot's own backdrop showing beside them. A photo therefore sits on the
// card colour; only the empty slot is the sunken grey.
describe('ArticleRow — the thumbnail slot', () => {
  it('drops the sunken fill behind a photo', () => {
    render(
      <ArticleRow
        article={article({ thumbnailUrl: 'https://img.example/oc115.jpg' })}
      />,
    )

    expect(screen.getByTestId('article-row-thumbnail')).not.toHaveClass(
      'bg-bg-sunken',
    )
  })

  it('keeps the sunken fill when there is no photo', () => {
    render(<ArticleRow article={article()} />)

    expect(screen.getByTestId('article-row-thumbnail')).toHaveClass(
      'bg-bg-sunken',
    )
  })
})

describe('ArticleRow — images that fail to load', () => {
  it('falls back to the placeholder when the thumbnail fails', () => {
    const { container } = render(
      <ArticleRow
        article={article({ thumbnailUrl: 'https://img.example/oc115.jpg' })}
      />,
    )

    fireEvent.error(container.querySelector('img')!)

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByTestId('article-row-thumbnail')).toHaveClass(
      'bg-bg-sunken',
    )
  })

  it('falls back to the brand name when the logo fails', () => {
    render(
      <ArticleRow
        article={article({ brandLogoUrl: 'https://img.example/wix.png' })}
      />,
    )

    fireEvent.error(screen.getByRole('img', { name: 'WIX' }))

    expect(screen.getByText('WIX')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'WIX' })).not.toBeInTheDocument()
  })
})

describe('ArticleRow — availability states', () => {
  it('renders the metadata while the availability read is still in flight', () => {
    render(<ArticleRow article={article()} />)

    expect(screen.getByRole('link', { name: 'WL6340' })).toBeInTheDocument()
    expect(screen.getByTestId('article-row-buy-skeleton')).toBeInTheDocument()
    expect(screen.getByRole('article')).toHaveAttribute('aria-busy', 'true')
  })

  it('fills the inventory columns once availability resolves', () => {
    render(<ArticleRow article={article()} availability={detail()} />)

    expect(screen.getByText(/15[.,]00/)).toBeInTheDocument()
    expect(screen.getByText('4 бр.')).toBeInTheDocument()
    expect(screen.getByText('Централен склад')).toBeInTheDocument()
    expect(screen.getByRole('article')).toHaveAttribute('aria-busy', 'false')
  })

  it('degrades to an unknown state when the availability read failed', () => {
    render(<ArticleRow article={article()} availability={null} />)

    expect(screen.getByText('Няма данни')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'WL6340' })).toBeInTheDocument()
  })

  // The line ships as one parcel, so raising the quantity past what the fastest
  // warehouse holds slows the promise — and the stock cell has to follow it, or
  // the row names one warehouse while its dot carries another's band.
  it('slows the delivery promise when the quantity outgrows the fastest warehouse', async () => {
    const user = userEvent.setup()
    render(
      <ArticleRow
        article={article()}
        availability={detail({
          availabilityByWarehouse: [
            warehouse('CENTRAL', 1),
            warehouse('REGIONAL_1', 5, 1),
          ],
        })}
      />,
    )

    expect(screen.getByText('за днес')).toBeInTheDocument()
    expect(screen.getByText('Централен склад')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Увеличи количеството за WL6340' }),
    )

    expect(screen.getByText('за 1 работен ден')).toBeInTheDocument()
    expect(screen.getByText('5 бр.')).toBeInTheDocument()
    expect(screen.getByText('Регионален склад 1')).toBeInTheDocument()
  })
})

describe('ArticleRow — interactions', () => {
  beforeEach(() => {
    useCart.setState({ lines: [] })
  })

  it('adds the article and its selected quantity to the cart', async () => {
    const user = userEvent.setup()
    render(<ArticleRow article={article()} availability={detail()} />)

    await user.click(
      screen.getByRole('button', { name: 'Увеличи количеството за WL6340' }),
    )
    await user.click(
      screen.getByRole('button', { name: /Добави Маслен филтър в кошницата/ }),
    )

    expect(useCart.getState().lines).toEqual([
      {
        brandId: '268',
        articleNumber: 'WL6340',
        brandName: 'WIX',
        brandLogoUrl: null,
        description: 'Маслен филтър',
        thumbnailUrl: null,
        quantity: 2,
        isSelected: true,
      },
    ])
  })

  // The cart row renders from what the line stores, so the line has to carry
  // the catalog metadata the list already had rather than just the identity.
  it('stores the part photo the list was showing', async () => {
    const user = userEvent.setup()
    render(
      <ArticleRow
        article={article({ thumbnailUrl: 'https://images.example/wl.jpg' })}
        availability={detail()}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: /Добави Маслен филтър в кошницата/ }),
    )

    expect(useCart.getState().lines[0].thumbnailUrl).toBe(
      'https://images.example/wl.jpg',
    )
  })

  it('raises the line instead of adding a second one for the same part', async () => {
    const user = userEvent.setup()
    render(<ArticleRow article={article()} availability={detail()} />)

    const addToCart = screen.getByRole('button', {
      name: /Добави Маслен филтър в кошницата/,
    })
    await user.click(addToCart)
    await user.click(addToCart)

    expect(useCart.getState().lines).toHaveLength(1)
    expect(useCart.getState().lines[0].quantity).toBe(2)
  })

  // A full cart prices none of its lines rather than some, so the row stops
  // offering the add instead of letting it silently do nothing.
  describe('with a full cart', () => {
    /** Fills every slot but `spare` with parts other than the row's. */
    function fillCartWithOtherParts(spare = 0) {
      useCart.setState({
        lines: Array.from({ length: MAX_CART_LINES - spare }, (_, index) => ({
          brandId: '268',
          articleNumber: `OTHER-${index}`,
          brandName: 'WIX',
          brandLogoUrl: null,
          description: 'Друга част',
          thumbnailUrl: null,
          quantity: 1,
          isSelected: true,
        })),
      })
    }

    it('disables the add and says why', () => {
      fillCartWithOtherParts()
      render(<ArticleRow article={article()} availability={detail()} />)

      expect(
        screen.getByRole('button', { name: /Кошницата е пълна/ }),
      ).toBeDisabled()
    })

    // Topping up raises a line rather than adding one, so it costs the batch
    // nothing and a full cart must not block it.
    it('still offers the add for a part already in the cart', () => {
      fillCartWithOtherParts(1)
      useCart.getState().addLine(
        {
          brandId: '268',
          articleNumber: 'WL6340',
          brandName: 'WIX',
          brandLogoUrl: null,
          description: 'Маслен филтър',
          thumbnailUrl: null,
        },
        1,
      )

      render(<ArticleRow article={article()} availability={detail()} />)

      expect(useCart.getState().lines).toHaveLength(MAX_CART_LINES)
      expect(
        screen.getByRole('button', { name: /Добави Маслен филтър в кошницата/ }),
      ).toBeEnabled()
    })
  })

  it('clamps the quantity to the stock the warehouses actually hold', async () => {
    const user = userEvent.setup()
    render(
      <ArticleRow
        article={article()}
        availability={detail({
          availabilityByWarehouse: [warehouse('CENTRAL', 2)],
        })}
      />,
    )

    const increment = screen.getByRole('button', {
      name: 'Увеличи количеството за WL6340',
    })
    await user.click(increment)

    expect(screen.getByLabelText('Количество за WL6340')).toHaveTextContent('2')
    expect(increment).toBeDisabled()
  })

  it('reveals the technical detail from the expander', async () => {
    const user = userEvent.setup()
    render(<ArticleRow article={article()} />)

    expect(screen.queryByText('79 mm')).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', {
        name: 'Допълнителна информация за WL6340',
      }),
    )

    expect(screen.getByText('79 mm')).toBeInTheDocument()
  })

  // Applicable vehicles are fetched on demand, so every row has something to
  // expand into even when the catalog response carried no specs.
  it('keeps the expander on a row with no catalog detail, offering the vehicles section', async () => {
    const user = userEvent.setup()
    render(<ArticleRow article={article({ technicalSpecs: [] })} />)

    await user.click(
      screen.getByRole('button', { name: 'Допълнителна информация за WL6340' }),
    )

    expect(
      screen.getByRole('button', { name: /Приложими автомобили/ }),
    ).toBeInTheDocument()
  })

  // Opening a row must not fetch anything — the vehicles section is behind its
  // own click, so the row still paints from catalog metadata alone.
  it('does not open the vehicles section by default', async () => {
    const user = userEvent.setup()
    render(<ArticleRow article={article()} />)

    await user.click(
      screen.getByRole('button', { name: 'Допълнителна информация за WL6340' }),
    )

    expect(
      screen.getByRole('button', { name: /Приложими автомобили/ }),
    ).toHaveAttribute('aria-expanded', 'false')
  })
})
