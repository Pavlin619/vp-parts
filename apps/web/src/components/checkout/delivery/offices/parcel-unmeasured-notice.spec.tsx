import { render, screen } from '@testing-library/react'
import { ParcelUnmeasuredNotice } from './parcel-unmeasured-notice'

describe('ParcelUnmeasuredNotice', () => {
  it('says delivery will be priced by phone', () => {
    render(<ParcelUnmeasuredNotice />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Някои артикули нямат данни за тегло. Ще ви се обадим с цената на доставката, след като ги измерим.',
    )
  })
})
