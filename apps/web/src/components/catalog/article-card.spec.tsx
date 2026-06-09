import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ArticleListItemDto } from '@vp-parts-shop/shared'
import { ArticleCard } from './article-card'

const baseArticle: ArticleListItemDto = {
  articleNumber: 'ART-001',
  brandName: 'Bosch',
  description: 'Oil Filter',
  thumbnailUrl: null,
  available: true,
  bestPriceExVat: 2183,
  bestPriceIncVat: 2599,
}

describe('ArticleCard — image', () => {
  it('renders an img tag when thumbnailUrl is provided', () => {
    render(
      <ArticleCard
        article={{ ...baseArticle, thumbnailUrl: 'https://example.com/img.jpg' }}
      />,
    )
    expect(screen.getByRole('img', { name: /Bosch ART-001/i })).toBeInTheDocument()
  })

  it('renders the fallback placeholder when thumbnailUrl is null', () => {
    render(<ArticleCard article={baseArticle} />)
    expect(screen.queryByRole('img', { name: /Bosch ART-001/i })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Без снимка')).toBeInTheDocument()
  })
})

describe('ArticleCard — availability', () => {
  it('shows the in-stock badge when available', () => {
    render(<ArticleCard article={baseArticle} />)
    expect(screen.getByLabelText('В наличност')).toBeInTheDocument()
  })

  it('shows the out-of-stock badge when not available', () => {
    render(<ArticleCard article={{ ...baseArticle, available: false }} />)
    // The badge text is "Временно изчерпан"; the button text is "Изчерпан" — getByText is unambiguous
    expect(screen.getByText('Временно изчерпан')).toBeInTheDocument()
  })

  it('enables the add-to-cart button when available', () => {
    render(<ArticleCard article={baseArticle} />)
    expect(
      screen.getByRole('button', { name: /Добави.*кошницата/i }),
    ).not.toBeDisabled()
  })

  it('disables the add-to-cart button when not available', () => {
    render(<ArticleCard article={{ ...baseArticle, available: false }} />)
    expect(
      screen.getByRole('button', { name: /Временно изчерпан/i }),
    ).toBeDisabled()
  })
})

describe('ArticleCard — price', () => {
  it('shows the price when available and bestPriceIncVat is set', () => {
    render(<ArticleCard article={baseArticle} />)
    expect(screen.getByLabelText(/Цена:/)).toBeInTheDocument()
  })

  it('hides the price when not available', () => {
    render(
      <ArticleCard article={{ ...baseArticle, available: false, bestPriceIncVat: 2599 }} />,
    )
    expect(screen.queryByLabelText(/Цена:/)).not.toBeInTheDocument()
  })

  it('hides the price when bestPriceIncVat is null', () => {
    render(<ArticleCard article={{ ...baseArticle, bestPriceIncVat: null }} />)
    expect(screen.queryByLabelText(/Цена:/)).not.toBeInTheDocument()
  })
})

describe('ArticleCard — add to cart', () => {
  it('calls onAddToCart with the article number when clicked', async () => {
    const onAddToCart = jest.fn()
    render(<ArticleCard article={baseArticle} onAddToCart={onAddToCart} />)
    await userEvent.click(screen.getByRole('button', { name: /Добави.*кошницата/i }))
    expect(onAddToCart).toHaveBeenCalledWith('ART-001')
  })

  it('does not throw when onAddToCart is not provided', async () => {
    render(<ArticleCard article={baseArticle} />)
    await expect(
      userEvent.click(screen.getByRole('button', { name: /Добави.*кошницата/i })),
    ).resolves.not.toThrow()
  })
})
