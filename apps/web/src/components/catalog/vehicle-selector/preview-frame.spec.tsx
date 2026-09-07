import { fireEvent, render, screen } from '@testing-library/react'
import { PreviewFrame } from './preview-frame'
import type { SelectedMake, SelectedSeries } from './use-vehicle-selector'

const BMW: SelectedMake = { id: '16', name: 'BMW' }
const SERIES_3: SelectedSeries = { id: 's3', manufacturerId: '16', name: '3 Series' }

/** The badge's path, which jsdom resolves against the test origin. */
function badgePathOf(container: HTMLElement) {
  return container.querySelector('img')?.getAttribute('src')
}

function renderFrame(
  seriesPhotoUrl: string | null,
  make: SelectedMake | null = BMW,
  series: SelectedSeries | null = SERIES_3,
  size: 'full' | 'compact' = 'full',
) {
  return render(
    <PreviewFrame
      selectedMake={make}
      selectedSeries={series}
      seriesPhotoUrl={seriesPhotoUrl}
      size={size}
    />,
  )
}

describe('PreviewFrame', () => {
  // The photo belongs to the series, so it shows as soon as a model is picked
  // rather than waiting for an engine.
  it('shows the car as soon as a series photo is available', () => {
    renderFrame('https://example.test/e90.jpg')

    const photo = screen.getByRole('img', { name: 'BMW 3 Series' })
    expect(photo).toBeInTheDocument()
    expect(photo).toHaveAttribute('src', 'https://example.test/e90.jpg')
  })

  // 12.6% of variants and a handful of whole series have no photo filed, so the
  // make's own badge is what the frame carries most of the time — the whole
  // brand step is spent on it.
  it('falls back to the make badge when there is no photo', () => {
    const { container } = renderFrame(null)

    expect(badgePathOf(container)).toContain('/vehicle-makes/bmw.webp')
    expect(screen.queryByTestId('make-wordmark')).not.toBeInTheDocument()
  })

  // 57 of the 286 selectable makes have no badge bundled, so the wordmark has to
  // reach the frame as well as the grid.
  it('falls back to a wordmark for a make with no badge', () => {
    const { container } = renderFrame(null, { id: '812', name: 'GLAS' }, null)

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByTestId('make-wordmark')).toHaveTextContent('GLAS')
  })

  it('holds a hatched panel until a make is picked', () => {
    const { container } = renderFrame(null, null, null)

    expect(container.firstElementChild).toHaveClass('hatched', 'bg-bg-sunken')
    expect(screen.getByText('Лого · фото на модел')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })

  // TecDoc bakes a white background into the photo, and the badges are drawn for
  // white — 28 of them opaque rather than transparent — so both frame in white.
  it('frames a photo and a badge in white', () => {
    const withPhoto = renderFrame('https://example.test/e90.jpg')
    expect(withPhoto.container.firstElementChild).toHaveClass('bg-white')
    withPhoto.unmount()

    const withBadge = renderFrame(null)
    expect(withBadge.container.firstElementChild).toHaveClass('bg-white')
  })

  // A token that died in the cache must cost the badge, not the browser's
  // broken-image icon. This is what makes a cache TTL an acceptable bet.
  it('falls back to the badge when the photo fails to load', () => {
    const { container } = renderFrame('https://example.test/dead-token.jpg')

    fireEvent.error(screen.getByRole('img', { name: 'BMW 3 Series' }))

    expect(screen.queryByRole('img', { name: 'BMW 3 Series' })).not.toBeInTheDocument()
    expect(badgePathOf(container)).toContain('/vehicle-makes/bmw.webp')
  })

  // Otherwise one dead photo would suppress every later one in the same dialog.
  it('retries the photo when the visitor picks a different model', () => {
    const { rerender } = renderFrame('https://example.test/dead-token.jpg')
    fireEvent.error(screen.getByRole('img', { name: 'BMW 3 Series' }))

    rerender(
      <PreviewFrame
        selectedMake={BMW}
        selectedSeries={SERIES_3}
        seriesPhotoUrl="https://example.test/fresh-token.jpg"
        size="full"
      />,
    )

    expect(screen.getByRole('img', { name: 'BMW 3 Series' })).toHaveAttribute(
      'src',
      'https://example.test/fresh-token.jpg',
    )
  })

  // All states share one ratio at both sizes, so neither panel resizes under the
  // visitor when a make is picked or a photo arrives.
  it('keeps the frame the same shape in every state and size', () => {
    const states: Array<[string | null, SelectedMake | null]> = [
      ['https://example.test/e90.jpg', BMW],
      [null, BMW],
      [null, null],
    ]

    for (const size of ['full', 'compact'] as const) {
      for (const [photoUrl, make] of states) {
        const view = renderFrame(photoUrl, make, null, size)
        expect(view.container.firstElementChild).toHaveClass('aspect-[16/9]')
        view.unmount()
      }
    }
  })

  // The strip sets the thumbnail beside the text rather than above it, so the
  // frame cannot take the width the sidebar's column gives it.
  it('draws the compact frame at a fixed width', () => {
    const { container } = renderFrame(null, BMW, null, 'compact')

    expect(container.firstElementChild).toHaveClass('w-24', 'flex-shrink-0')
  })
})
