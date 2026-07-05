import type { ArticleListItemDto } from '@vp-parts-shop/shared'
import { selectRelatedArticles } from './related-parts'

const makeArticle = (articleNumber: string): ArticleListItemDto => ({
  articleNumber,
  brandName: 'Bosch',
  description: 'Brake Disc',
  thumbnailUrl: null,
  available: true,
  bestPriceExVat: 1250,
  bestPriceIncVat: 1500,
})

describe('selectRelatedArticles', () => {
  it('excludes the article currently being viewed', () => {
    const articles = [makeArticle('A-001'), makeArticle('A-002')]
    const result = selectRelatedArticles(articles, 'A-001')
    expect(result.map((a) => a.articleNumber)).toEqual(['A-002'])
  })

  it('caps the result at the given limit', () => {
    const articles = ['A-001', 'A-002', 'A-003', 'A-004', 'A-005'].map(makeArticle)
    const result = selectRelatedArticles(articles, 'A-999', 3)
    expect(result).toHaveLength(3)
  })

  it('defaults to a limit of four', () => {
    const articles = Array.from({ length: 10 }, (_, i) =>
      makeArticle(`A-${i}`),
    )
    expect(selectRelatedArticles(articles, 'A-999')).toHaveLength(4)
  })

  it('returns an empty array when there are no other articles', () => {
    expect(selectRelatedArticles([makeArticle('A-001')], 'A-001')).toEqual([])
  })
})
