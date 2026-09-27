import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RegionSelect } from './region-select'

const REGIONS = ['Плевен', 'Софийска област', 'София-град']

describe('RegionSelect', () => {
  it('offers every region, and all of them', () => {
    render(<RegionSelect regions={REGIONS} region={null} onChange={jest.fn()} />)

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Всички области',
      'Плевен',
      'Софийска област',
      'София-град',
    ])
    expect(screen.getByRole('combobox', { name: 'Област' })).toHaveValue('')
  })

  it('shows the chosen region', () => {
    render(<RegionSelect regions={REGIONS} region="София-град" onChange={jest.fn()} />)

    expect(screen.getByRole('combobox', { name: 'Област' })).toHaveValue('София-град')
  })

  it('reports the region chosen, and no region for all of them', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<RegionSelect regions={REGIONS} region="Плевен" onChange={onChange} />)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Област' }), 'София-град')
    expect(onChange).toHaveBeenLastCalledWith('София-град')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Област' }), 'Всички области')
    expect(onChange).toHaveBeenLastCalledWith(null)
  })
})
