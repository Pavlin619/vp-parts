import { addToCartAriaLabel } from './add-to-cart-label'

describe('addToCartAriaLabel', () => {
  const labels = {
    addingLabel: 'Добавяне…',
    readyLabel: 'Добави в кошницата',
    fullLabel: 'Кошницата е пълна',
  }

  it('names the write in progress above anything else', () => {
    expect(
      addToCartAriaLabel({ isAdding: true, canAdd: false, ...labels }),
    ).toBe('Добавяне…')
  })

  it('offers to add the part when there is room', () => {
    expect(
      addToCartAriaLabel({ isAdding: false, canAdd: true, ...labels }),
    ).toBe('Добави в кошницата')
  })

  it('says the cart is full once there is no room', () => {
    expect(
      addToCartAriaLabel({ isAdding: false, canAdd: false, ...labels }),
    ).toBe('Кошницата е пълна')
  })
})
