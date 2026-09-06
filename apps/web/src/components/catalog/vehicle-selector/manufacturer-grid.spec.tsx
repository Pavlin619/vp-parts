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
    // decorative mark out of it.
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

  // A band across the panel rather than a line of text over the cards: the
  // negative margin cancels the scrolling panel's padding, and the fill has to
  // be opaque because the cards pass behind it.
  it('draws each marker as a band across the whole panel', () => {
    render(<ManufacturerGrid manufacturers={MAKES} isFiltered={false} onSelect={jest.fn()} />)

    screen
      .getAllByRole('heading', { level: 3 })
      .forEach((marker) => expect(marker).toHaveClass('-mx-5', 'px-5', 'bg-canvas', 'border-t'))
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

  it('renders the bundled badge on a card, without repeating the name', () => {
    render(
      <ManufacturerGrid
        manufacturers={[MAKES[1]]}
        isFiltered={false}
        onSelect={jest.fn()}
      />,
    )

    expect(screen.getByTestId('make-logo')).toHaveAttribute('src', '/vehicle-makes/bmw.webp')
    expect(screen.getByRole('button', { name: 'BMW' })).toBeInTheDocument()
  })

  // Two initials put FEIDI, FENGON and FEST on three identical "FE" tiles, and
  // all three still fall back to a wordmark. The whole point of the wordmark is
  // that neighbours differ; `make-mark.spec.tsx` covers how it is set.
  it('distinguishes alphabetical neighbours that share an initial', () => {
    const neighbours = ['FEIDI', 'FENGON', 'FEST']

    neighbours.forEach((_, index) =>
      expect(VEHICLE_MAKE_LOGO_FILES[`90${index}`]).toBeUndefined(),
    )

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
})
