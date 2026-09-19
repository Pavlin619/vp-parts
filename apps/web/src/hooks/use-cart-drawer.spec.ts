import { useCartDrawer } from './use-cart-drawer'

describe('useCartDrawer', () => {
  beforeEach(() => {
    useCartDrawer.setState({ isOpen: false })
  })

  it('starts closed', () => {
    expect(useCartDrawer.getState().isOpen).toBe(false)
  })

  it('opens and closes', () => {
    useCartDrawer.getState().openCartDrawer()
    expect(useCartDrawer.getState().isOpen).toBe(true)

    useCartDrawer.getState().closeCartDrawer()
    expect(useCartDrawer.getState().isOpen).toBe(false)
  })

  // Adding a second part while the drawer is already up must not toggle it shut.
  it('stays open when opened again', () => {
    useCartDrawer.getState().openCartDrawer()
    useCartDrawer.getState().openCartDrawer()

    expect(useCartDrawer.getState().isOpen).toBe(true)
  })
})
