import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AvailabilityLoadError } from './availability-load-error'

describe('AvailabilityLoadError', () => {
  it('renders a scoped alert with the default copy', () => {
    render(<AvailabilityLoadError onRetry={jest.fn()} />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(
      screen.getByText('В момента не можем да заредим наличността.'),
    ).toBeInTheDocument()
  })

  it('renders a custom title when provided', () => {
    render(
      <AvailabilityLoadError
        onRetry={jest.fn()}
        title="В момента не можем да заредим заменките."
      />,
    )

    expect(
      screen.getByText('В момента не можем да заредим заменките.'),
    ).toBeInTheDocument()
  })

  it('calls onRetry when the retry button is clicked', async () => {
    const user = userEvent.setup()
    const onRetry = jest.fn()
    render(<AvailabilityLoadError onRetry={onRetry} />)

    await user.click(screen.getByRole('button', { name: 'Опитай отново' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
