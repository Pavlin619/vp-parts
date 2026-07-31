import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OemNumberChip } from './oem-number-chip'

describe('OemNumberChip', () => {
  it('copies the number to the clipboard', async () => {
    const user = userEvent.setup()
    render(<OemNumberChip code="13717521033" />)

    await user.click(
      screen.getByRole('button', { name: 'Копирай номер 13717521033' }),
    )

    expect(await navigator.clipboard.readText()).toBe('13717521033')
  })

  it('announces the copy on the chip that was pressed', async () => {
    const user = userEvent.setup()
    render(<OemNumberChip code="13717521033" />)

    await user.click(
      screen.getByRole('button', { name: 'Копирай номер 13717521033' }),
    )

    expect(
      screen.getByRole('button', { name: 'Копирано' }),
    ).toBeInTheDocument()
  })

  it('renders the manufacturer when the number is a cross-reference', () => {
    render(<OemNumberChip code="HU6018Z" manufacturer="MANN-FILTER" />)

    expect(screen.getByText('MANN-FILTER')).toBeInTheDocument()
  })

  it('keeps the number readable when clipboard access is denied', async () => {
    const user = userEvent.setup()
    jest
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValueOnce(new Error('denied'))

    render(<OemNumberChip code="L387" />)
    await user.click(screen.getByRole('button', { name: /Копирай номер L387/ }))

    expect(screen.getByText('L387')).toBeInTheDocument()
  })
})
