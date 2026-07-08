import { render, screen } from '@testing-library/react'
import type { TechnicalSpecDto } from '@vp-parts-shop/shared'
import { ArticleSpecs } from './article-specs'

const specs: TechnicalSpecDto[] = [
  { key: 'Височина (mm)', value: '87' },
  { key: 'Външен диаметър (mm)', value: '76' },
]

describe('ArticleSpecs', () => {
  it('renders the technical specs as label/value pairs', () => {
    render(<ArticleSpecs technicalSpecs={specs} />)
    expect(screen.getByText('Височина (mm)')).toBeInTheDocument()
    expect(screen.getByText('87')).toBeInTheDocument()
  })

  it('renders nothing when there are no technical specs', () => {
    const { container } = render(<ArticleSpecs technicalSpecs={[]} />)
    expect(
      screen.queryByText('Технически характеристики'),
    ).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })
})
