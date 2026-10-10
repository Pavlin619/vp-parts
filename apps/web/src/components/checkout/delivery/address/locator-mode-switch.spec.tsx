import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LocatorModeSwitch } from './locator-mode-switch'

describe('LocatorModeSwitch', () => {
  it('marks only the current mode as checked', () => {
    render(<LocatorModeSwitch mode="quarter" onChange={jest.fn()} />)

    expect(screen.getByRole('radio', { name: 'Квартал / ж.к.' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Улица и номер' })).not.toBeChecked()
  })

  it('reports the mode that was clicked', async () => {
    const onChange = jest.fn()
    render(<LocatorModeSwitch mode="street" onChange={onChange} />)

    await userEvent.click(screen.getByRole('radio', { name: 'Квартал / ж.к.' }))

    expect(onChange).toHaveBeenCalledWith('quarter')
  })

  it('moves to the other mode with the arrow keys and focuses it', async () => {
    const onChange = jest.fn()
    render(<LocatorModeSwitch mode="street" onChange={onChange} />)

    screen.getByRole('radio', { name: 'Улица и номер' }).focus()
    await userEvent.keyboard('{ArrowRight}')

    expect(onChange).toHaveBeenCalledWith('quarter')
    expect(screen.getByRole('radio', { name: 'Квартал / ж.к.' })).toHaveFocus()
  })

  it('keeps only the current mode in the tab order', () => {
    render(<LocatorModeSwitch mode="street" onChange={jest.fn()} />)

    expect(screen.getByRole('radio', { name: 'Улица и номер' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('radio', { name: 'Квартал / ж.к.' })).toHaveAttribute('tabindex', '-1')
  })
})
