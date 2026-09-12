import { render, screen } from '@testing-library/react'
import { CategoryThumb } from './category-thumb'

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} data-testid="category-illustration" />
  ),
}))

describe('CategoryThumb', () => {
  it('renders the bundled illustration for a registered root', () => {
    render(<CategoryThumb categoryId="100002" />)

    const illustration = screen.getByTestId('category-illustration')

    expect(illustration).toHaveAttribute(
      'src',
      '/category-illustrations/engine.webp',
    )
    // The card prints the category name beside the tile, so the image must not
    // repeat it to a screen reader.
    expect(illustration).toHaveAttribute('alt', '')
  })

  // Routing every tile through the manifest is what makes an unregistered root
  // a designed placeholder rather than a broken image.
  it('falls back to the neutral tile for a root with no illustration', () => {
    const { container } = render(<CategoryThumb categoryId="999999" />)

    expect(
      screen.queryByTestId('category-illustration'),
    ).not.toBeInTheDocument()
    expect(container.firstElementChild).toHaveClass('hatched')
  })
})
