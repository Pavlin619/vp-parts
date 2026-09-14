import { fireEvent, render, screen } from '@testing-library/react'
import { BrandLogo } from './brand-logo'

describe('BrandLogo', () => {
  it('shows the mark, with the brand name as its alt text', () => {
    render(<BrandLogo brandName="WIX" brandLogoUrl="https://logos.example/wix.png" />)

    expect(screen.getByAltText('WIX')).toBeInTheDocument()
  })

  it('prints the wordmark when there is no logo', () => {
    render(<BrandLogo brandName="WIX" brandLogoUrl={null} />)

    expect(screen.getByText('WIX')).toBeInTheDocument()
  })

  // A logo that fails to load is no logo at all — an unregistered TecDoc image
  // host fails exactly this way.
  it('falls back to the wordmark when the logo fails to load', () => {
    render(<BrandLogo brandName="WIX" brandLogoUrl="https://logos.example/gone.png" />)

    fireEvent.error(screen.getByAltText('WIX'))

    expect(screen.getByText('WIX')).toBeInTheDocument()
  })
})
