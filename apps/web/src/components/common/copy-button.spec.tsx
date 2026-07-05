import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CopyButton } from './copy-button'

describe('CopyButton', () => {
  it('renders an icon-only button with the given label and no text', () => {
    render(<CopyButton value="BRM-09.A914.11" label="Копирай артикулен номер" />)
    const button = screen.getByRole('button', {
      name: 'Копирай артикулен номер',
    })
    expect(button).toBeInTheDocument()
    expect(button).toHaveTextContent('')
  })

  it('copies the value to the clipboard and shows the copied state', async () => {
    const user = userEvent.setup()
    render(<CopyButton value="BRM-09.A914.11" label="Копирай артикулен номер" />)

    await user.click(
      screen.getByRole('button', { name: 'Копирай артикулен номер' }),
    )

    expect(await navigator.clipboard.readText()).toBe('BRM-09.A914.11')
    expect(
      screen.getByRole('button', { name: 'Копирано' }),
    ).toBeInTheDocument()
  })
})
