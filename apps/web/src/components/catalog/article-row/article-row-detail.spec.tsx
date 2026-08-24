import type { ReactElement } from 'react'
import type { OemNumberDto } from '@vp-parts-shop/shared'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArticleRowDetail } from './article-row-detail'

// Every read-on-demand section is stubbed: this spec is about which section is
// open, not what any of them renders. Their own specs cover that — and mounting
// the real ones here would need a query client to no purpose. Each stub echoes
// the part it was handed, because all three read TecDoc by brand *and* number.
type SectionProps = { brandId: string; articleNumber: string }

const part = ({ brandId, articleNumber }: SectionProps) =>
  `${brandId}:${articleNumber}`

jest.mock('./article-row-numbers', () => ({
  ArticleRowNumbers: (props: SectionProps) => (
    <div data-testid="numbers-section">{part(props)}</div>
  ),
}))

jest.mock('./article-row-substitutes', () => ({
  ArticleRowSubstitutes: (props: SectionProps) => (
    <div data-testid="substitutes-section">{part(props)}</div>
  ),
}))

jest.mock('./article-row-vehicles', () => ({
  ArticleRowVehicles: (props: SectionProps) => (
    <div data-testid="vehicles-section">{part(props)}</div>
  ),
}))

const specs = [
  { key: 'Височина', value: '79 mm' },
  { key: 'Външен диаметър', value: '93 mm' },
]

function oem(
  articleNumber: string,
  manufacturerName: string | null = 'BMW',
  interchangeability: string | null = null,
): OemNumberDto {
  return { articleNumber, manufacturerName, interchangeability }
}

const oemNumbers = [oem('13717521033'), oem('13718508913')]

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
      <ArticleRowDetail
        brandId="268"
        articleNumber="WL6340"
        technicalSpecs={specs}
        oemNumbers={oemNumbers}
      />,
    )

    expect(
      screen.getByRole('rowheader', { name: 'Височина' }),
    ).toBeInTheDocument()
    expect(screen.getByText('79 mm')).toBeInTheDocument()
  })

  it('switches to the alternative numbers section', async () => {
    const user = userEvent.setup()
    render(
      <ArticleRowDetail
        brandId="268"
        articleNumber="WL6340"
        technicalSpecs={specs}
        oemNumbers={oemNumbers}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Алтернативни номера/ }))

    expect(screen.getByTestId('numbers-section')).toHaveTextContent('268:WL6340')
    expect(screen.queryByText('79 mm')).not.toBeInTheDocument()
  })

  // The substitutes read is brand-scoped like the vehicles one beside it: it
  // starts from the OE numbers of this brand's part, so the section cannot be
  // handed the number alone.
  it('switches to the substitutes section', async () => {
    const user = userEvent.setup()
    render(
      <ArticleRowDetail
        brandId="268"
        articleNumber="WL6340"
        technicalSpecs={specs}
        oemNumbers={oemNumbers}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Заменяеми/ }))

    expect(screen.getByTestId('substitutes-section')).toHaveTextContent(
      '268:WL6340',
    )
    expect(screen.queryByText('79 mm')).not.toBeInTheDocument()
  })

  it('collapses the open section when its tab is clicked again', async () => {
    const user = userEvent.setup()
    render(
      <ArticleRowDetail
        brandId="268"
        articleNumber="WL6340"
        technicalSpecs={specs}
        oemNumbers={oemNumbers}
      />,
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
        brandId="268"
        articleNumber="WL6340"
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

  it('offers the specs section only when the catalog response carries specs', () => {
    render(
      <ArticleRowDetail
        brandId="268"
        articleNumber="WL6340"
        technicalSpecs={[]}
        oemNumbers={oemNumbers}
      />,
    )

    expect(
      screen.queryByRole('button', { name: /Технически характеристики/ }),
    ).not.toBeInTheDocument()
  })

  // Whether an article has cross-reference numbers, substitutes or applicable
  // vehicles is only known once they are fetched, so all three sections are
  // offered unconditionally — including on a row the catalog response left bare.
  it('always offers the read-on-demand sections', () => {
    render(
      <ArticleRowDetail
        brandId="268"
        articleNumber="WL6340"
        technicalSpecs={[]}
        oemNumbers={[]}
      />,
    )

    expect(
      screen.getByRole('button', { name: /Алтернативни номера/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Заменяеми/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Приложими автомобили/ }),
    ).toBeInTheDocument()
  })

  // Substitutes lead the read-on-demand sections: they are the same
  // cross-references as the alternative numbers, but as parts a visitor can
  // compare and buy.
  it('offers the sections in display order', () => {
    render(
      <ArticleRowDetail
        brandId="268"
        articleNumber="WL6340"
        technicalSpecs={specs}
        oemNumbers={oemNumbers}
      />,
    )

    expect(screen.getAllByRole('button').map((tab) => tab.textContent)).toEqual([
      'Технически характеристики',
      'Заменяеми',
      'Алтернативни номера',
      'Приложими автомобили',
    ])
  })

  // All three sit behind a TecDoc read, so none may open by itself — that would
  // fetch for every row a visitor expands.
  it('leaves the read-on-demand sections closed until one is asked for', () => {
    render(
      <ArticleRowDetail
        brandId="268"
        articleNumber="WL6340"
        technicalSpecs={specs}
        oemNumbers={oemNumbers}
      />,
    )

    expect(
      screen.getByRole('button', { name: /Алтернативни номера/ }),
    ).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: /Заменяеми/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(
      screen.getByRole('button', { name: /Приложими автомобили/ }),
    ).toHaveAttribute('aria-expanded', 'false')
  })

  // With no specs there is no free section to fall back on, so the expander
  // opens on the tab bar alone rather than paying for a read nobody asked for.
  it('opens with no section selected when the row has no specs', () => {
    render(
      <ArticleRowDetail
        brandId="268"
        articleNumber="WL6340"
        technicalSpecs={[]}
        oemNumbers={oemNumbers}
      />,
    )

    expect(screen.queryByTestId('numbers-section')).not.toBeInTheDocument()
    expect(screen.queryByTestId('substitutes-section')).not.toBeInTheDocument()
    expect(screen.queryByTestId('vehicles-section')).not.toBeInTheDocument()
  })
})
