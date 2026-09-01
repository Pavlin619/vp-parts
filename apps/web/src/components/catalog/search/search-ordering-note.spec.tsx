import { render, screen } from '@testing-library/react'
import { SearchOrderingNote } from './search-ordering-note'

describe('SearchOrderingNote', () => {
  it('says the list leads with what we can ship', () => {
    render(<SearchOrderingNote ordering="availability" />)

    expect(screen.getByText(/Първо частите в наличност/)).toBeInTheDocument()
  })

  // The whole point of the note: a set too wide to rank is not a broken list,
  // it is one narrowing away from a ranked one — so say what to do about it.
  it('asks for a narrowing when the set was too wide to rank', () => {
    render(<SearchOrderingNote ordering="catalogue" />)

    expect(screen.getByText(/Уточнете търсенето/)).toBeInTheDocument()
  })

  // A visitor reading "in stock first" over a list that is not ordered that way
  // would trust a promise we did not keep, so the two must never both appear.
  it('never claims an availability order on the catalogue path', () => {
    render(<SearchOrderingNote ordering="catalogue" />)

    expect(
      screen.queryByText(/Първо частите в наличност/),
    ).not.toBeInTheDocument()
  })

  it('asks for no narrowing once the set is ranked', () => {
    render(<SearchOrderingNote ordering="availability" />)

    expect(screen.queryByText(/Уточнете търсенето/)).not.toBeInTheDocument()
  })
})
