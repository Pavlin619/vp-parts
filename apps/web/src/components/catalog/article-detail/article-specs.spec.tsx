import { render, screen } from '@testing-library/react'
import type { TechnicalSpecDto } from '@vp-parts-shop/shared'
import { ArticleSpecs } from './article-specs'

const specs: TechnicalSpecDto[] = [
  { key: 'Височина (mm)', value: '87' },
  { key: 'Външен диаметър (mm)', value: '76' },
]

describe('ArticleSpecs', () => {
  it('renders the technical specs as label/value pairs', () => {
    render(<ArticleSpecs technicalSpecs={specs} oemNumbers={[]} />)
    expect(screen.getByText('Височина (mm)')).toBeInTheDocument()
    expect(screen.getByText('87')).toBeInTheDocument()
  })

  it('renders the OEM cross-reference numbers', () => {
    render(
      <ArticleSpecs
        technicalSpecs={[]}
        oemNumbers={['06L115561', '06L115562']}
      />,
    )
    expect(screen.getByText('06L115561')).toBeInTheDocument()
    expect(screen.getByText('06L115562')).toBeInTheDocument()
  })

  it('omits a section entirely when it has no data', () => {
    render(<ArticleSpecs technicalSpecs={[]} oemNumbers={[]} />)
    expect(
      screen.queryByText('Технически характеристики'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('OEM номера (съвместими)')).not.toBeInTheDocument()
  })
})
