import { render, screen } from '@testing-library/react'
import { ScopeNote } from './scope-note'

describe('ScopeNote', () => {
  it('names the car the count belongs to', () => {
    render(
      <p>
        788 части <ScopeNote scope={{ vehicleId: '13074', vehicleName: 'AUDI A3' }} />
      </p>,
    )

    expect(screen.getByText(/788 части за/)).toHaveTextContent(
      '788 части за AUDI A3',
    )
  })

  it('says the catalogue when no car is picked', () => {
    render(
      <p>
        788 части <ScopeNote scope={null} />
      </p>,
    )

    expect(screen.getByText('788 части в каталога')).toBeInTheDocument()
  })
})
