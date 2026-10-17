import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderReferenceChip } from './order-reference-chip'

describe('OrderReferenceChip', () => {
  it('shows the reference', () => {
    render(<OrderReferenceChip reference="VP-000123" />)

    expect(screen.getByText('VP-000123')).toBeInTheDocument()
  })

  it('copies the reference and says so', async () => {
    const user = userEvent.setup()
    render(<OrderReferenceChip reference="VP-000123" />)

    await user.click(screen.getByRole('button', { name: 'Копирай номера' }))

    expect(await navigator.clipboard.readText()).toBe('VP-000123')
    expect(screen.getByRole('button', { name: 'Номерът е копиран' })).toBeInTheDocument()
  })

  it('stays as it was when the clipboard is refused', async () => {
    const user = userEvent.setup()
    render(<OrderReferenceChip reference="VP-000123" />)
    jest.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))

    await user.click(screen.getByRole('button', { name: 'Копирай номера' }))

    expect(screen.getByRole('button', { name: 'Копирай номера' })).toBeInTheDocument()
  })
})
