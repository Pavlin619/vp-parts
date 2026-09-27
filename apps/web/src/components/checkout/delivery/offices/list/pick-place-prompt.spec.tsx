import { render, screen } from '@testing-library/react'
import { PickPlacePrompt } from './pick-place-prompt'

describe('PickPlacePrompt', () => {
  it('asks for a place, or for the customer to be located', () => {
    render(<PickPlacePrompt />)

    expect(
      screen.getByText('Изберете населено място или натиснете „Близо до мен“.'),
    ).toBeInTheDocument()
  })
})
