import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TextField } from './text-field'

describe('TextField', () => {
  it('reports what is typed into the labelled input', async () => {
    const user = userEvent.setup()
    const onValueChange = jest.fn()

    render(<TextField label="Име" value="" onValueChange={onValueChange} />)

    await user.type(screen.getByLabelText('Име'), 'И')

    expect(onValueChange).toHaveBeenCalledWith('И')
  })

  it('ties an error to the input it is about', () => {
    render(
      <TextField label="Име" value="" onValueChange={jest.fn()} error="Въведете име" />,
    )

    const input = screen.getByLabelText('Име')

    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Въведете име')
  })

  it('is not marked invalid without an error', () => {
    render(<TextField label="Име" value="" onValueChange={jest.fn()} />)

    expect(screen.getByLabelText('Име')).not.toHaveAttribute('aria-invalid')
  })

  it('says when it may be left empty', () => {
    render(<TextField label="Вход" value="" onValueChange={jest.fn()} isOptional />)

    expect(screen.getByText('по желание')).toBeInTheDocument()
  })

  it('offers its suggestions while typing', () => {
    const { container } = render(
      <TextField
        label="Град"
        value=""
        onValueChange={jest.fn()}
        suggestions={['София', 'Пловдив']}
      />,
    )

    const listId = screen.getByLabelText('Град').getAttribute('list')
    const options = container.querySelectorAll(`datalist[id="${listId}"] option`)

    expect([...options].map((option) => option.getAttribute('value'))).toEqual([
      'София',
      'Пловдив',
    ])
  })
})
