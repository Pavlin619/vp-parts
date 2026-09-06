import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ModelSeriesDto } from '@vp-parts-shop/shared'
import { ModelSeriesList } from './model-series-list'

const series = (
  id: string,
  name: string,
  yearFrom: number,
  yearTo: number | null,
): ModelSeriesDto => ({
  id,
  manufacturerId: '5',
  name,
  yearFrom,
  yearTo,
})

// Two bodies of one series, which is the case the years are there to tell apart.
const SERIES = [
  series('1', '80 B4 Седан (8C2)', 1991, 1995),
  series('6', '80 B4 Avant (8C5)', 1991, 1996),
  series('45678', 'Q6 E-TRON (GEN)', 2024, null),
]

function rows() {
  return within(screen.getByRole('list', { name: 'Модели' })).getAllByRole('button')
}

describe('ModelSeriesList', () => {
  it('prints the production window under every model name', () => {
    render(<ModelSeriesList series={SERIES} onSelect={jest.fn()} />)

    expect(rows().map((row) => row.textContent)).toEqual([
      '80 B4 Седан (8C2)1991–1995',
      '80 B4 Avant (8C5)1991–1996',
      'Q6 E-TRON (GEN)2024+',
    ])
  })

  // The name and the window are one label: a row read as its name alone cannot
  // be told from the other body of the same series.
  it('names a row by its model and years together', () => {
    render(<ModelSeriesList series={SERIES} onSelect={jest.fn()} />)

    expect(rows()[0]).toHaveAccessibleName('80 B4 Седан (8C2) 1991–1995')
  })

  it('hands the whole series to the caller when a row is clicked', async () => {
    const onSelect = jest.fn()
    render(<ModelSeriesList series={SERIES} onSelect={onSelect} />)

    await userEvent.click(rows()[1])

    expect(onSelect).toHaveBeenCalledWith(SERIES[1])
  })

  it('renders nothing but the list wrapper for a make with no series', () => {
    render(<ModelSeriesList series={[]} onSelect={jest.fn()} />)

    expect(
      within(screen.getByRole('list', { name: 'Модели' })).queryAllByRole('button'),
    ).toHaveLength(0)
  })
})
