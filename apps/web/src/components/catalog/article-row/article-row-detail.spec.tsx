import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArticleRowDetail } from './article-row-detail'

const specs = [
  { key: 'Височина', value: '79 mm' },
  { key: 'Външен диаметър', value: '93 mm' },
]

const oemNumbers = ['13717521033', '13718508913']

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

describe('ArticleRowDetail', () => {
  it('opens on the technical characteristics by default', () => {
    render(
      <ArticleRowDetail technicalSpecs={specs} oemNumbers={oemNumbers} />,
    )

    expect(screen.getByRole('rowheader', { name: 'Височина' })).toBeInTheDocument()
    expect(screen.getByText('79 mm')).toBeInTheDocument()
  })

  it('switches to the OE numbers section', async () => {
    const user = userEvent.setup()
    render(
      <ArticleRowDetail technicalSpecs={specs} oemNumbers={oemNumbers} />,
    )

    await user.click(screen.getByRole('button', { name: /OE номера/ }))

    expect(screen.getByText('13717521033')).toBeInTheDocument()
    expect(screen.queryByText('79 mm')).not.toBeInTheDocument()
  })

  it('collapses the open section when its tab is clicked again', async () => {
    const user = userEvent.setup()
    render(
      <ArticleRowDetail technicalSpecs={specs} oemNumbers={oemNumbers} />,
    )

    await user.click(
      screen.getByRole('button', { name: /Технически характеристики/ }),
    )

    expect(screen.queryByText('79 mm')).not.toBeInTheDocument()
  })

  // TecDoc labels several criteria the same way — notes especially — so the
  // description is not a unique row identity.
  it('renders every spec when TecDoc repeats a criteria label', () => {
    renderWithoutReactWarnings(
      <ArticleRowDetail
        technicalSpecs={[
          { key: 'Забележка', value: 'за модели с ABS' },
          { key: 'Забележка', value: 'само за десен волан' },
        ]}
        oemNumbers={[]}
      />,
    )

    expect(screen.getByText('за модели с ABS')).toBeInTheDocument()
    expect(screen.getByText('само за десен волан')).toBeInTheDocument()
  })

  // With no specs the OE section is the one open by default, so the chips are
  // on screen without a click.
  it('renders repeated OE numbers without colliding keys', () => {
    renderWithoutReactWarnings(
      <ArticleRowDetail technicalSpecs={[]} oemNumbers={['A2C', 'A2C']} />,
    )

    expect(screen.getAllByText('A2C')).toHaveLength(2)
  })

  it('only offers the sections that carry data', () => {
    render(<ArticleRowDetail technicalSpecs={[]} oemNumbers={oemNumbers} />)

    expect(
      screen.queryByRole('button', { name: /Технически характеристики/ }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('13717521033')).toBeInTheDocument()
  })
})
