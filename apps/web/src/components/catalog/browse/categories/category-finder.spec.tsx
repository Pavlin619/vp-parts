import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CategoryFinder } from './category-finder'

const finder = () => screen.getByRole('textbox', { name: 'Търси категория' })

describe('CategoryFinder', () => {
  it('reports what is typed, a character at a time', async () => {
    const onChange = jest.fn()
    render(<CategoryFinder value="" onChange={onChange} />)

    await userEvent.type(finder(), 'фи')

    expect(onChange).toHaveBeenNthCalledWith(1, 'ф')
    expect(onChange).toHaveBeenNthCalledWith(2, 'и')
  })

  // Nothing to clear while the box is empty, and a permanent dead button beside
  // the caret reads as a control that has stopped working.
  it('offers no clear button until something is typed', () => {
    const { rerender } = render(
      <CategoryFinder value="" onChange={jest.fn()} />,
    )

    expect(
      screen.queryByRole('button', { name: 'Изчисти' }),
    ).not.toBeInTheDocument()

    rerender(<CategoryFinder value="накладки" onChange={jest.fn()} />)

    expect(screen.getByRole('button', { name: 'Изчисти' })).toBeInTheDocument()
  })

  it('empties the term from the clear button', async () => {
    const onChange = jest.fn()
    render(<CategoryFinder value="накладки" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Изчисти' }))

    expect(onChange).toHaveBeenCalledWith('')
  })
})
