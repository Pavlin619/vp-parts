import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchScopeSelect } from './search-scope-select'

describe('SearchScopeSelect', () => {
  it('names the current scope', () => {
    render(<SearchScopeSelect scope="generic" onChange={jest.fn()} />)

    expect(
      screen.getByRole('button', { name: /Общо търсене/ }),
    ).toBeInTheDocument()
  })

  it('opens the scope list', async () => {
    const user = userEvent.setup()
    render(<SearchScopeSelect scope="generic" onChange={jest.fn()} />)

    await user.click(screen.getByRole('button', { name: /Общо търсене/ }))

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })

  it('marks the current scope as selected', async () => {
    const user = userEvent.setup()
    render(<SearchScopeSelect scope="part" onChange={jest.fn()} />)

    await user.click(screen.getByRole('button', { name: /Номер на част/ }))

    expect(screen.getByRole('option', { name: /Номер на част/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('reports the chosen scope and closes', async () => {
    const onChange = jest.fn()
    const user = userEvent.setup()
    render(<SearchScopeSelect scope="generic" onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: /Общо търсене/ }))
    await user.click(screen.getByRole('option', { name: /Номер на част/ }))

    expect(onChange).toHaveBeenCalledWith('part')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('closes when the visitor clicks away', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <SearchScopeSelect scope="generic" onChange={jest.fn()} />
        <button type="button">elsewhere</button>
      </div>,
    )

    await user.click(screen.getByRole('button', { name: /Общо търсене/ }))
    await user.click(screen.getByRole('button', { name: 'elsewhere' }))

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
