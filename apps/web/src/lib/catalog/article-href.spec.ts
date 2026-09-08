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

  // The detail page's breadcrumb reads it: TecDoc files one part under several
  // category trails, so this is what says which one the visitor walked.
  it('carries the category the visitor was standing in', () => {
    expect(articleDetailHref('287', 'OX 389/1D', '100245')).toBe(
      '/catalog/articles/287/OX%20389%2F1D?categoryId=100245',
    )
  })

  it('leaves the URL bare for a surface with no category of its own', () => {
    expect(articleDetailHref('287', 'OX 389/1D')).toBe(
      '/catalog/articles/287/OX%20389%2F1D',
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
