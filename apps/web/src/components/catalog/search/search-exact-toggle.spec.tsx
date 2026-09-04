import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchExactToggle } from './search-exact-toggle'

describe('SearchExactToggle', () => {
  it('exposes its state as a switch', () => {
    render(<SearchExactToggle isExact onChange={jest.fn()} />)

    expect(screen.getByRole('switch', { name: 'Точно съвпадение' })).toBeChecked()
  })

  it('reports the flipped value', async () => {
    const onChange = jest.fn()
    const user = userEvent.setup()
    render(<SearchExactToggle isExact={false} onChange={onChange} />)

    await user.click(screen.getByRole('switch'))

    expect(onChange).toHaveBeenCalledWith(true)
  })

  // Neither the switch nor its label says which way it is set — the track's
  // position is the only cue, and it is 22px wide.
  it.each([
    [true, 'Точно съвпадение — вкл.'],
    [false, 'Точно съвпадение — изкл.'],
  ])('names the state it is in when isExact is %s', async (isExact, label) => {
    const user = userEvent.setup()
    render(<SearchExactToggle isExact={isExact} onChange={jest.fn()} />)

    await user.hover(screen.getByRole('switch'))

    expect(await screen.findByText(label)).toBeInTheDocument()
    expect(
      screen.getByText(/съвпадат буква по буква/, { exact: false }),
    ).toBeInTheDocument()
  })

  // The visible hint was dropped from the panel, so this is the only thing left
  // saying the shortcut exists.
  it('declares the keyboard shortcut', () => {
    render(<SearchExactToggle isExact={false} onChange={jest.fn()} />)

    expect(screen.getByRole('switch')).toHaveAttribute(
      'aria-keyshortcuts',
      'Alt+E',
    )
  })
})
