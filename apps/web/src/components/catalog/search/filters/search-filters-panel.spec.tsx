import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchFiltersPanel } from './search-filters-panel'

function renderPanel(props: { total?: number; activeCount?: number } = {}) {
  return render(
    <SearchFiltersPanel
      total={props.total ?? 114}
      activeCount={props.activeCount ?? 0}
    >
      <p>филтри</p>
    </SearchFiltersPanel>,
  )
}

const trigger = () => screen.getByRole('button', { name: /Филтри/ })

describe('SearchFiltersPanel', () => {
  it('renders the filters even while the panel is closed', () => {
    renderPanel()

    // The blocks are always in the DOM — the desktop sidebar is the same markup,
    // shown by CSS rather than re-rendered when the mobile panel opens.
    expect(screen.getByText('филтри')).toBeInTheDocument()
  })

  it('opens on the trigger and closes on the close button', async () => {
    renderPanel()

    expect(trigger()).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(trigger())
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'Затвори филтрите' }))
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes on Escape', async () => {
    renderPanel()

    await userEvent.click(trigger())
    await userEvent.keyboard('{Escape}')

    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes from the footer, which counts the matches waiting behind it', async () => {
    renderPanel({ total: 1234 })

    await userEvent.click(trigger())
    // The thousands separator is a non-breaking space, which the accessible
    // name keeps verbatim.
    await userEvent.click(
      screen.getByRole('button', { name: /^Покажи 1\s234 резултата$/ }),
    )

    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
  })

  it('names one match in the singular', async () => {
    renderPanel({ total: 1 })

    await userEvent.click(trigger())
    expect(
      screen.getByRole('button', { name: 'Покажи 1 резултат' }),
    ).toBeInTheDocument()
  })

  it('badges the trigger with the number of narrowings applied', () => {
    renderPanel({ activeCount: 3 })

    expect(trigger()).toHaveAccessibleName('Филтри (3 приложени)')
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('carries no badge when nothing is applied', () => {
    renderPanel({ activeCount: 0 })

    expect(trigger()).toHaveAccessibleName('Филтри')
  })

  it('locks the page behind the open panel so only the filters scroll', async () => {
    renderPanel()

    await userEvent.click(trigger())
    expect(document.body).toHaveStyle({ overflow: 'hidden' })

    await userEvent.click(screen.getByRole('button', { name: 'Затвори филтрите' }))
    expect(document.body).not.toHaveStyle({ overflow: 'hidden' })
  })

  it('releases the scroll lock when it unmounts while open', async () => {
    const { unmount } = renderPanel()

    await userEvent.click(trigger())
    unmount()

    expect(document.body).not.toHaveStyle({ overflow: 'hidden' })
  })
})
