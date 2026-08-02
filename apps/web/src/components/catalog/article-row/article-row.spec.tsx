import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {
  ArticleInventoryDetailDto,
  ArticleSummaryDto,
  WarehouseAvailabilityDto,
  WarehouseId,
} from '@vp-parts-shop/shared'
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
    oemNumbers: [
      {
        articleNumber: '13717521033',
        manufacturerName: 'BMW',
        interchangeability: null,
      },
    ],
    fitsVehicle: null,
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
describe('ArticleRow — images that fail to load', () => {
  it('falls back to the placeholder when the thumbnail fails', () => {
    const { container } = render(
      <ArticleRow
        article={article({ thumbnailUrl: 'https://img.example/oc115.jpg' })}
      />,
    )

    fireEvent.error(container.querySelector('img')!)

    expect(container.querySelector('img')).toBeNull()
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
})

describe('ArticleRow — interactions', () => {
  it('adds the article and its selected quantity to the cart', async () => {
    const user = userEvent.setup()
    const onAddToCart = jest.fn()
    render(
      <ArticleRow
        article={article()}
        availability={detail()}
        onAddToCart={onAddToCart}
      />,
    )

    await user.click(
      screen.getByRole('button', { name: 'Увеличи количеството' }),
    )
    await user.click(
      screen.getByRole('button', { name: /Добави Маслен филтър в кошницата/ }),
    )

    expect(onAddToCart).toHaveBeenCalledWith('WL6340', 2)
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
      name: 'Увеличи количеството',
    })
    await user.click(increment)

    expect(screen.getByLabelText('Количество')).toHaveTextContent('2')
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
  // expand into even when the catalog response carried no specs or OE numbers.
  it('keeps the expander on a row with no catalog detail, offering the vehicles section', async () => {
    const user = userEvent.setup()
    render(
      <ArticleRow article={article({ technicalSpecs: [], oemNumbers: [] })} />,
    )

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
