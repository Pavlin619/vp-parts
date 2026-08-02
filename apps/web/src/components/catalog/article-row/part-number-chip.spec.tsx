import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PartNumberChip } from './part-number-chip'

describe('PartNumberChip', () => {
  it('copies the number to the clipboard', async () => {
    const user = userEvent.setup()
    render(<PartNumberChip code="13717521033" />)

    await user.click(
      screen.getByRole('button', { name: 'Копирай номер 13717521033' }),
    )

    expect(await navigator.clipboard.readText()).toBe('13717521033')
  })

  it('announces the copy on the chip that was pressed', async () => {
    const user = userEvent.setup()
    render(<PartNumberChip code="13717521033" />)

    await user.click(
      screen.getByRole('button', { name: 'Копирай номер 13717521033' }),
    )

    expect(
      screen.getByRole('button', { name: 'Копирано' }),
    ).toBeInTheDocument()
  })

  it('renders the note beside the number', () => {
    render(<PartNumberChip code="HU6018Z" note="Различен обхват на доставка" />)

    expect(screen.getByText('Различен обхват на доставка')).toBeInTheDocument()
  })

  it('renders the manufacturer beside the number and names it in the copy action', () => {
    render(<PartNumberChip code="11427508969" manufacturer="BMW" />)

    expect(screen.getByText('BMW')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Копирай номер 11427508969 на BMW' }),
    ).toBeInTheDocument()
  })

  // One number filed under several makes arrives comma-joined, so the chip must
  // not assume a single marque.
  it('renders several marques on one chip', () => {
    render(<PartNumberChip code="06J 115 403 Q" manufacturer="VW, AUDI" />)

    expect(screen.getByText('VW, AUDI')).toBeInTheDocument()
  })

  it('keeps the number readable when clipboard access is denied', async () => {
    const user = userEvent.setup()
    jest
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValueOnce(new Error('denied'))

    render(<PartNumberChip code="L387" />)
    await user.click(screen.getByRole('button', { name: /Копирай номер L387/ }))

    expect(screen.getByText('L387')).toBeInTheDocument()
  })
})
