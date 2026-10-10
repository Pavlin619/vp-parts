import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShippingMethod } from '@vp-parts-shop/shared'
import { AddressPicker } from './address-picker'

async function fillStreetAddress(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Населено място'), 'София')
  await user.type(screen.getByLabelText('Пощенски код'), '1303')
  await user.type(screen.getByLabelText('Улица / бул.'), 'ул. Опълченска')
  await user.type(screen.getByLabelText('Номер'), '46')
}

describe('AddressPicker', () => {
  it('starts on the form', () => {
    render(<AddressPicker carrier={ShippingMethod.ECONT} />)

    expect(screen.getByRole('form', { name: 'Адрес за доставка' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Доставяй на този адрес' })).toBeEnabled()
  })

  it('shows what is missing and focuses the first such field when confirming too early', async () => {
    const user = userEvent.setup()
    render(<AddressPicker carrier={ShippingMethod.ECONT} />)

    await user.click(screen.getByRole('button', { name: 'Доставяй на този адрес' }))

    expect(screen.getByText('Въведи населено място')).toBeInTheDocument()
    expect(screen.getByText('Въведи 4 цифри')).toBeInTheDocument()
    expect(screen.getByText('Въведи улица и номер')).toBeInTheDocument()
    expect(screen.getByLabelText('Населено място')).toHaveFocus()
  })

  it('points to the manual fields when the search finds nothing', async () => {
    const user = userEvent.setup()
    render(<AddressPicker carrier={ShippingMethod.ECONT} />)

    await user.type(screen.getByLabelText('Търсене на адрес'), 'Витоша')

    expect(screen.getByText(/попълни го ръчно/)).toBeInTheDocument()
  })

  it('asks for the number under it once a street was left without one', async () => {
    const user = userEvent.setup()
    render(<AddressPicker carrier={ShippingMethod.ECONT} />)

    await user.type(screen.getByLabelText('Улица / бул.'), 'ул. Опълченска')
    await user.tab()

    expect(screen.getByLabelText('Номер')).toHaveAccessibleDescription('Въведи номер')
  })

  it('asks for where in the quarter under the block', async () => {
    const user = userEvent.setup()
    render(<AddressPicker carrier={ShippingMethod.ECONT} />)

    await user.type(screen.getByLabelText('Кв. / ж.к.'), 'Младост 1')
    await user.tab()

    expect(screen.getByLabelText('Блок')).toHaveAccessibleDescription(
      'Добави блок, вход, етаж или апартамент',
    )
  })

  it('accepts a quarter with a block instead of a street', async () => {
    const user = userEvent.setup()
    render(<AddressPicker carrier={ShippingMethod.ECONT} />)

    await user.type(screen.getByLabelText('Населено място'), 'София')
    await user.type(screen.getByLabelText('Пощенски код'), '1799')
    await user.type(screen.getByLabelText('Кв. / ж.к.'), 'Младост 1')
    await user.type(screen.getByLabelText('Блок'), '5')
    await user.type(screen.getByLabelText(/Забележка/), 'звънецът не работи')
    await user.click(screen.getByRole('button', { name: 'Доставяй на този адрес' }))

    expect(screen.getByText('Младост 1, бл. 5, 1799 София')).toBeInTheDocument()
    expect(screen.getByText('Бележка: звънецът не работи')).toBeInTheDocument()
  })

  it('counts the note against its limit', async () => {
    const user = userEvent.setup()
    render(<AddressPicker carrier={ShippingMethod.ECONT} />)

    await user.type(screen.getByLabelText(/Забележка/), 'abc')

    expect(screen.getByText('3/100')).toBeInTheDocument()
  })

  it('shows the confirmed address and lets the customer change it', async () => {
    const user = userEvent.setup()
    render(<AddressPicker carrier={ShippingMethod.ECONT} />)

    await fillStreetAddress(user)
    await user.click(screen.getByRole('button', { name: 'Доставяй на този адрес' }))

    expect(screen.getByText('ул. Опълченска 46, 1303 София')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Промени' }))

    expect(screen.getByLabelText('Улица / бул.')).toHaveValue('ул. Опълченска')
    expect(screen.getByRole('button', { name: 'Отказ' })).toBeInTheDocument()
  })
})
