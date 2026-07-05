import { render, screen } from '@testing-library/react'
import type { ArticleListItemDto } from '@vp-parts-shop/shared'
import { ArticleGrid } from './article-grid'

jest.mock('./article-card', () => ({
  ArticleCard: ({ article }: { article: ArticleListItemDto }) => (
    <div data-testid="article-card">{article.articleNumber}</div>
  ),
}))

const makeArticle = (articleNumber: string): ArticleListItemDto => ({
  articleNumber,
  brandName: 'Bosch',
  description: 'Oil Filter',
  thumbnailUrl: null,
  available: true,
  bestPriceExVat: 2183,
  bestPriceIncVat: 2599,
})

describe('ArticleGrid — empty state', () => {
  it('shows the empty message when articles array is empty', () => {
    render(<ArticleGrid articles={[]} total={0} />)
    expect(screen.getByText('Няма намерени части в тази категория.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})

describe('ArticleGrid — populated state', () => {
  it('renders an ArticleCard for each article', () => {
    const articles = [makeArticle('A-001'), makeArticle('A-002')]
    render(<ArticleGrid articles={articles} total={2} />)
    expect(screen.getAllByTestId('article-card')).toHaveLength(2)
    expect(screen.queryByText('Няма намерени части в тази категория.')).not.toBeInTheDocument()
  })

  it('displays the total result count', () => {
    render(<ArticleGrid articles={[makeArticle('A-001')]} total={42} />)
    expect(screen.getByText('42 резултата')).toBeInTheDocument()
  })
})
