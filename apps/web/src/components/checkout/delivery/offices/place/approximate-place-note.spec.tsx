import { render, screen } from '@testing-library/react'
import { ApproximatePlaceNote } from './approximate-place-note'

describe('ApproximatePlaceNote', () => {
  it('says the place is a guess and how to change it', () => {
    render(<ApproximatePlaceNote placeName="Пловдив" />)

    expect(screen.getByText(/Пловдив/)).toHaveTextContent(
      'Показваме офиси в Пловдив по приблизителното ви местоположение. Ако не сте там, изберете друго населено място.',
    )
  })
})
