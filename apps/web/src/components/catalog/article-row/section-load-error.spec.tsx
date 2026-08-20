import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SectionLoadError } from './section-load-error'

describe('SectionLoadError', () => {
  // An alert rather than plain text: the panel a visitor just opened came back
  // empty, and nothing else on the row says so.
  it('announces the failure and offers a retry', async () => {
    const user = userEvent.setup()
    const onRetry = jest.fn()

    render(<SectionLoadError message="Не можем да заредим." onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Не можем да заредим.')

    await user.click(screen.getByRole('button', { name: 'Опитай отново' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
