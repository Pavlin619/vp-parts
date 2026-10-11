import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MAX_CART_LINES } from '@vp-parts-shop/shared'
import { useCart } from '@/hooks/use-cart'
import { CartMergeNotice } from './cart-merge-notice'

describe('CartMergeNotice', () => {
  beforeEach(() => {
    useCart.setState({ droppedLines: [] })
  })

  it('renders nothing when the merge kept every part', () => {
    const { container } = render(<CartMergeNotice />)

    expect(container).toBeEmptyDOMElement()
  })

  describe('when a sign-in merge dropped parts', () => {
    beforeEach(() => {
      useCart.setState({
        droppedLines: [
          { brandId: '268', articleNumber: 'WL6340', brandName: 'WIX' },
          { brandId: '30', articleNumber: '0 986 494 524', brandName: '' },
        ],
      })
    })

    it('names each part by brand and article number', () => {
      render(<CartMergeNotice />)

      expect(screen.getByText('WIX WL6340')).toBeInTheDocument()
      expect(screen.getByText('0 986 494 524')).toBeInTheDocument()
    })

    it('says why they were left out', () => {
      render(<CartMergeNotice />)

      expect(
        screen.getByText(new RegExp(`побира до ${MAX_CART_LINES} различни артикула`)),
      ).toBeInTheDocument()
    })

    it('can be dismissed', async () => {
      render(<CartMergeNotice />)

      await userEvent.click(screen.getByRole('button', { name: 'Затвори' }))

      expect(useCart.getState().droppedLines).toEqual([])
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
  })
})
