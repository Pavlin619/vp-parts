import { render, screen } from '@testing-library/react'
import { SearchResultsTitle } from './search-results-title'

describe('SearchResultsTitle', () => {
  /**
   * Asserted as an exact string rather than a substring: the label and the term
   * are separate elements only because they are styled apart, and run together
   * they read — and are announced — as one word.
   */
  it('heads the results with the term they answer', () => {
    render(<SearchResultsTitle query="въздушен филтър BMW 320d" />)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Резултати за „въздушен филтър BMW 320d“',
    )
  })

  // A part number is the term most likely to be mistyped and re-read off this
  // heading, so it has to come back exactly as it went in.
  it('prints the term as typed, spacing and punctuation included', () => {
    render(<SearchResultsTitle query="WL 634/2" />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      '„WL 634/2“',
    )
  })
})
