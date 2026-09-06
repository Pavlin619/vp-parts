import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VehicleSelectorStepTabs } from './step-tabs'
import type { Step } from './use-vehicle-selector'

function renderTabs(step: Step, stepValues: (string | null)[] = [null, null, null]) {
  const onStepClick = jest.fn()

  render(
    <VehicleSelectorStepTabs step={step} stepValues={stepValues} onStepClick={onStepClick} />,
  )

  return { onStepClick }
}

describe('VehicleSelectorStepTabs', () => {
  it('numbers the steps a visitor has not reached', () => {
    renderTabs(0)

    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  // The number is replaced rather than joined by a tick, so the token stays one
  // glyph wide and the strip does not reflow as steps complete.
  it('replaces a completed step number with a tick', () => {
    renderTabs(1, ['AUDI', null, null])

    expect(screen.queryByText('1')).not.toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  // Read out, "1 Марка · AUDI" is noise: the tab's own label already says which
  // step it is and what was picked.
  it('keeps the number out of the tab name', () => {
    renderTabs(1, ['AUDI', null, null])

    expect(screen.getByRole('button', { name: 'Марка · AUDI' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Модел' })).toBeInTheDocument()
  })

  it('lets a visitor step back but not skip ahead', async () => {
    const { onStepClick } = renderTabs(1, ['AUDI', null, null])

    expect(screen.getByRole('button', { name: 'Двигател' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Марка · AUDI' }))

    expect(onStepClick).toHaveBeenCalledWith(0)
  })
})
