import { articleDetailHref } from './article-href'

describe('articleDetailHref', () => {
  it('puts the brand ahead of the article number', () => {
    expect(articleDetailHref('72', 'OF-OC115')).toBe(
      '/catalog/articles/72/OF-OC115',
    )
  })

  // Article numbers routinely carry spaces and slashes, both of which end the
  // path segment if they reach the URL raw.
  it('URL-encodes the article number', () => {
    expect(articleDetailHref('94', 'OX 982D')).toBe(
      '/catalog/articles/94/OX%20982D',
    )
    expect(articleDetailHref('94', 'BD 0986/451')).toBe(
      '/catalog/articles/94/BD%200986%2F451',
    )
  })

  // The whole reason the brand is in the path: two data suppliers can file one
  // number, and they are two different parts.
  it('gives two brands of one number two different URLs', () => {
    expect(articleDetailHref('30', 'OX 982D')).not.toBe(
      articleDetailHref('94', 'OX 982D'),
    )
  })
})
