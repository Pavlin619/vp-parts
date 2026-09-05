import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ManufacturerDto } from '@vp-parts-shop/shared'
import { ManufacturerGrid } from './manufacturer-grid'
import { VEHICLE_MAKE_LOGO_FILES } from '@/lib/catalog/vehicle-make-mark'

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} data-testid="make-logo" />
  ),
}))

const make = (id: string, name: string, isPopular: boolean): ManufacturerDto => ({
  id,
  name,
  isPopular,
})

const MAKES = [
  make('74', 'MERCEDES-BENZ', true),
  make('16', 'BMW', true),
  make('3', 'AUTO UNION', false),
  make('8399', 'REZON', false),
]

function expectCardNames(list: HTMLElement, names: string[]) {
  const cards = within(list).getAllByRole('button')

  expect(cards).toHaveLength(names.length)
  cards.forEach((card, index) => expect(card).toHaveAccessibleName(names[index]))
}

describe('ManufacturerGrid', () => {
  it('splits browsing into a popular section and the rest', () => {
    render(<ManufacturerGrid manufacturers={MAKES} isFiltered={false} onSelect={jest.fn()} />)

    const popular = screen.getByRole('list', { name: 'Популярни' })
    const all = screen.getByRole('list', { name: 'A–Z' })

    // Asserted on the accessible name rather than the text, which also pins the
    // decorative monogram out of it.
    expectCardNames(popular, ['MERCEDES-BENZ', 'BMW'])
    expectCardNames(all, ['AUTO UNION', 'REZON'])
  })

  // Both markers pin to the top of the scrolling panel, so a visitor part-way
  // down 251 alphabetical makes can still see which half they are in.
  it('pins both section markers to the top of the list', () => {
    render(<ManufacturerGrid manufacturers={MAKES} isFiltered={false} onSelect={jest.fn()} />)

    const markers = screen.getAllByRole('heading', { level: 3 })

    expect(markers.map((marker) => marker.textContent)).toEqual(['Популярни', 'A–Z'])
    markers.forEach((marker) => expect(marker).toHaveClass('sticky', 'top-0'))
  })

  // A query matching one popular make would otherwise render a "Популярни"
  // heading over a single card with an empty section beneath it.
  it('collapses to a single ungrouped list while searching', () => {
    render(
      <ManufacturerGrid
        manufacturers={[MAKES[1]]}
        isFiltered
        onSelect={jest.fn()}
      />,
    )

    expect(screen.queryByRole('list', { name: 'Популярни' })).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Марки' })).toBeInTheDocument()
  })

  it('omits the popular section when nothing in the list is popular', () => {
    render(
      <ManufacturerGrid
        manufacturers={[MAKES[2], MAKES[3]]}
        isFiltered={false}
        onSelect={jest.fn()}
      />,
    )

    expect(screen.queryByRole('list', { name: 'Популярни' })).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'A–Z' })).toBeInTheDocument()
  })

  it('hands the whole make to the caller when a card is clicked', async () => {
    const onSelect = jest.fn()
    render(<ManufacturerGrid manufacturers={MAKES} isFiltered={false} onSelect={onSelect} />)

    await userEvent.click(screen.getByRole('button', { name: 'BMW' }))

    expect(onSelect).toHaveBeenCalledWith(MAKES[1])
  })

  // Glas is the largest make no badge source resolves safely, at 27 vehicles,
  // so the fallback is a live state in the A–Z run rather than an edge case.
  // 57 of the 286 selectable makes render this way.
  it('falls back to a wordmark without a bundled logo, keeping the card named', () => {
    expect(VEHICLE_MAKE_LOGO_FILES['812']).toBeUndefined()

    render(
      <ManufacturerGrid
        manufacturers={[make('812', 'GLAS', false)]}
        isFiltered={false}
        onSelect={jest.fn()}
      />,
    )

    expect(screen.queryByTestId('make-logo')).not.toBeInTheDocument()
    // The wordmark repeats the label, so it must stay out of the accessible
    // name — otherwise every fallback card reads "GLAS GLAS".
    expect(screen.getByRole('button', { name: 'GLAS' })).toBeInTheDocument()
  })

  // Two initials put FEIDI, FENGON and FEST on three identical "FE" tiles, and
  // all three still fall back. The whole point of the wordmark is that
  // neighbours differ.
  it('distinguishes alphabetical neighbours that share an initial', () => {
    const neighbours = ['FEIDI', 'FENGON', 'FEST']

    render(
      <ManufacturerGrid
        manufacturers={neighbours.map((name, index) => make(`90${index}`, name, false))}
        isFiltered={false}
        onSelect={jest.fn()}
      />,
    )

    expect(screen.getAllByTestId('make-wordmark').map((mark) => mark.textContent)).toEqual(
      neighbours,
    )
  })

  // A multi-word name sets one word per line, and the line count feeds the
  // size. A short name stays whole even when it has a break in it: ICH-X gains
  // no size from splitting and would read as a stack of stubs.
  it.each([
    ['GLAS', ['GLAS']],
    ['KG MOBILITY', ['KG', 'MOBILITY']],
    ['STANDARD AUTOMOBILE', ['STANDARD', 'AUTOMOBILE']],
    ['AUSTIN-HEALEY', ['AUSTIN', 'HEALEY']],
    ['ICH-X', ['ICH-X']],
    ['B-ON', ['B-ON']],
  ])('sets %s one word per line', (name, lines) => {
    expect(VEHICLE_MAKE_LOGO_FILES['999000']).toBeUndefined()

    render(
      <ManufacturerGrid
        manufacturers={[make('999000', name, false)]}
        isFiltered={false}
        onSelect={jest.fn()}
      />,
    )

    const wordmark = screen.getByTestId('make-wordmark')

    expect([...wordmark.querySelectorAll('span')].map((line) => line.textContent)).toEqual(lines)
  })

  it.each([
    ['74', 'MERCEDES-BENZ', '/vehicle-makes/mercedes-benz.webp'],
    ['16', 'BMW', '/vehicle-makes/bmw.webp'],
  ])('renders the bundled mark for %s', (id, name, src) => {
    render(
      <ManufacturerGrid
        manufacturers={[make(id, name, true)]}
        isFiltered={false}
        onSelect={jest.fn()}
      />,
    )

    expect(screen.getByTestId('make-logo')).toHaveAttribute('src', src)
    // The name is printed below the mark, so the image must not repeat it.
    expect(screen.getByRole('button', { name })).toBeInTheDocument()
  })
})
