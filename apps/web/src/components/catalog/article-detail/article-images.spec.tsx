import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArticleImages } from './article-images'

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} />
  ),
}))

describe('ArticleImages', () => {
  it('shows the striped placeholder when there are no images', () => {
    render(
      <ArticleImages images={[]} articleNumber="WL6340" brandName="WIX" />,
    )
    expect(screen.getByLabelText('Без снимка')).toBeInTheDocument()
  })

  it('renders the first image as the main image by default', () => {
    render(
      <ArticleImages
        images={['/a.jpg', '/b.jpg']}
        articleNumber="WL6340"
        brandName="WIX"
      />,
    )
    expect(screen.getByAltText('WIX WL6340')).toHaveAttribute('src', '/a.jpg')
  })

  it('switches the main image when a thumbnail is clicked', async () => {
    const user = userEvent.setup()
    render(
      <ArticleImages
        images={['/a.jpg', '/b.jpg']}
        articleNumber="WL6340"
        brandName="WIX"
      />,
    )

    await user.click(screen.getByLabelText('Снимка 2'))

    expect(screen.getByAltText('WIX WL6340')).toHaveAttribute('src', '/b.jpg')
  })

  it('does not render a thumbnail strip for a single image', () => {
    render(
      <ArticleImages images={['/a.jpg']} articleNumber="WL6340" brandName="WIX" />,
    )
    expect(screen.queryByLabelText('Снимки на продукта')).not.toBeInTheDocument()
  })
})
