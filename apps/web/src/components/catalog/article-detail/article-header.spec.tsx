import { render, screen } from '@testing-library/react'
import { ArticleHeader } from './article-header'

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} />
  ),
}))

const props = {
  brandName: 'Brembo',
  description: 'Комплект накладки предни · P 06 075',
  articleNumber: 'BRM-09.A914.11',
}

describe('ArticleHeader', () => {
  it('uses the article number as the leading title under its label', () => {
    render(<ArticleHeader {...props} />)
    expect(screen.getByText('Артикулен номер')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'BRM-09.A914.11' }),
    ).toBeInTheDocument()
  })

  it('renders an icon-only copy button for the article number', () => {
    render(<ArticleHeader {...props} />)
    const copyButton = screen.getByRole('button', {
      name: 'Копирай артикулен номер',
    })
    expect(copyButton).toBeInTheDocument()
    expect(copyButton).toHaveTextContent('')
  })

  it('renders the description', () => {
    render(<ArticleHeader {...props} />)
    expect(
      screen.getByText('Комплект накладки предни · P 06 075'),
    ).toBeInTheDocument()
  })

  it('shows the brand name as text when no logo is available', () => {
    render(<ArticleHeader {...props} />)
    expect(screen.getByText('Brembo')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('renders the brand logo when a logo URL is provided', () => {
    render(<ArticleHeader {...props} brandLogoUrl="https://logos.example/brembo.png" />)
    const logo = screen.getByAltText('Brembo')
    expect(logo).toHaveAttribute('src', 'https://logos.example/brembo.png')
    expect(screen.queryByText('Brembo')).not.toBeInTheDocument()
  })

  it('does not render an OE/AM chip', () => {
    render(<ArticleHeader {...props} />)
    expect(screen.queryByText('OE')).not.toBeInTheDocument()
    expect(screen.queryByText('AM')).not.toBeInTheDocument()
  })

  it('does not render a rating or review count at launch', () => {
    render(<ArticleHeader {...props} />)
    expect(screen.queryByLabelText(/Оценка/)).not.toBeInTheDocument()
    expect(screen.queryByText(/отзива/)).not.toBeInTheDocument()
  })
})
