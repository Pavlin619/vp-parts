import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'
import type { TechnicalSpecDto } from '@vp-parts-shop/shared'
import { ArticleSpecs } from './article-specs'

const specs: TechnicalSpecDto[] = [
  { key: 'Височина (mm)', value: '87' },
  { key: 'Външен диаметър (mm)', value: '76' },
]

/**
 * React only reports a duplicate `key` through `console.error`, so asserting on
 * the rendered output alone would pass while React is free to drop a row.
 */
function renderWithoutReactWarnings(ui: ReactElement) {
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

  render(ui)

  expect(consoleError).not.toHaveBeenCalled()
  consoleError.mockRestore()
}

describe('ArticleSpecs', () => {
  it('renders the technical specs as label/value pairs', () => {
    render(<ArticleSpecs technicalSpecs={specs} />)
    expect(screen.getByText('Височина (mm)')).toBeInTheDocument()
    expect(screen.getByText('87')).toBeInTheDocument()
  })

  // TecDoc labels several criteria the same way — a side or a note filed once
  // per data variant — so the description is not a unique row identity.
  it('renders every spec when TecDoc repeats a criteria label', () => {
    renderWithoutReactWarnings(
      <ArticleSpecs
        technicalSpecs={[
          { key: 'Страна на монтаж', value: 'Ляво' },
          { key: 'Страна на монтаж', value: 'Дясно' },
        ]}
      />,
    )

    expect(screen.getByText('Ляво')).toBeInTheDocument()
    expect(screen.getByText('Дясно')).toBeInTheDocument()
  })

  it('renders nothing when there are no technical specs', () => {
    const { container } = render(<ArticleSpecs technicalSpecs={[]} />)
    expect(
      screen.queryByText('Технически характеристики'),
    ).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })
})
