import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CompatibleVehicleDto } from '@vp-parts-shop/shared'
import { ArticleTabs } from './article-tabs'

const vehicles: CompatibleVehicleDto[] = [
  { vehicleId: 'V10042', name: 'VW Golf VII 2.0 TDI (2012–2020)' },
]

describe('ArticleTabs', () => {
  it('shows the description tab by default', () => {
    render(<ArticleTabs compatibleVehicles={vehicles} />)
    expect(
      screen.getByRole('tab', { name: 'Описание' }),
    ).toHaveAttribute('aria-selected', 'true')
  })

  it('labels the compatibility tab with the vehicle count', () => {
    render(<ArticleTabs compatibleVehicles={vehicles} />)
    expect(
      screen.getByRole('tab', { name: 'Съвместимост (1)' }),
    ).toBeInTheDocument()
  })

  it('switches to the compatibility tab and lists compatible vehicles', async () => {
    const user = userEvent.setup()
    render(<ArticleTabs compatibleVehicles={vehicles} />)

    await user.click(screen.getByRole('tab', { name: 'Съвместимост (1)' }))

    expect(
      screen.getByText('VW Golf VII 2.0 TDI (2012–2020)'),
    ).toBeInTheDocument()
  })

  it('renders the provided description over the placeholder', () => {
    render(
      <ArticleTabs
        description="Истинско описание на продукта"
        compatibleVehicles={[]}
      />,
    )
    expect(
      screen.getByText('Истинско описание на продукта'),
    ).toBeInTheDocument()
  })
})
