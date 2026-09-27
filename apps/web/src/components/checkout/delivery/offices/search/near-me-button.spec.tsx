import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NearMeButton } from './near-me-button'

describe('NearMeButton', () => {
  it('asks to locate the customer when pressed', async () => {
    const user = userEvent.setup()
    const onClick = jest.fn()
    render(<NearMeButton isLocating={false} onClick={onClick} />)

    await user.click(screen.getByRole('button', { name: 'Близо до мен' }))

    expect(onClick).toHaveBeenCalled()
  })

  it('waits while the device is answering', () => {
    render(<NearMeButton isLocating onClick={jest.fn()} />)

    const button = screen.getByRole('button', { name: 'Близо до мен' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })
})
