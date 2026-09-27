import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SuggestionButton } from './suggestion-button'

describe('SuggestionButton', () => {
  it('reports a click', async () => {
    const user = userEvent.setup()
    const onClick = jest.fn()
    render(<SuggestionButton onClick={onClick}>Плевен</SuggestionButton>)

    await user.click(screen.getByRole('button', { name: 'Плевен' }))

    expect(onClick).toHaveBeenCalled()
  })

  // Safari never focuses a clicked button, so only a box that keeps focus survives the click.
  it('does not take focus from the search box when pressed', () => {
    render(<SuggestionButton onClick={jest.fn()}>Плевен</SuggestionButton>)

    const isDefaultKept = fireEvent.mouseDown(screen.getByRole('button', { name: 'Плевен' }))

    expect(isDefaultKept).toBe(false)
  })
})
