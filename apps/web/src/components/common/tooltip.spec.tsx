import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tooltip } from './tooltip'

/**
 * The panel opens on focus with no delay, which is what these use — hovering
 * has to rest on the trigger for {@link Tooltip}'s open delay before it counts,
 * and a fake clock driving that races the pointer events userEvent dispatches.
 */
describe('Tooltip', () => {
  it('renders the trigger it was given rather than wrapping it', () => {
    render(
      <Tooltip label="Точно съвпадение — изкл.">
        <button type="button" role="switch" aria-checked={false} aria-label="Точно съвпадение" />
      </Tooltip>,
    )

    expect(screen.getByRole('switch', { name: 'Точно съвпадение' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('leaves the trigger clickable', async () => {
    const onClick = jest.fn()
    const user = userEvent.setup()
    render(
      <Tooltip label="Точно съвпадение">
        <button type="button" onClick={onClick}>
          Превключи
        </button>
      </Tooltip>,
    )

    await user.click(screen.getByRole('button', { name: 'Превключи' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('stays closed until the trigger is interacted with', () => {
    render(
      <Tooltip label="MAHLE">
        <span>logo</span>
      </Tooltip>,
    )

    expect(screen.queryByText('MAHLE')).not.toBeInTheDocument()
  })

  it('shows the label and the description on focus', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip
        label="Точно съвпадение — изкл."
        description="Връща само артикули, които съвпадат буква по буква."
      >
        <button type="button">Превключи</button>
      </Tooltip>,
    )

    await user.tab()

    expect(await screen.findByText('Точно съвпадение — изкл.')).toBeInTheDocument()
    expect(
      screen.getByText('Връща само артикули, които съвпадат буква по буква.'),
    ).toBeInTheDocument()
  })

  it('renders no description paragraph when it has only a label', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip label="MAHLE">
        <button type="button">logo</button>
      </Tooltip>,
    )

    await user.tab()

    const label = await screen.findByText('MAHLE')
    expect(label.parentElement?.querySelectorAll('p')).toHaveLength(1)
  })

  it('describes the trigger, so the panel is not an unlabelled decoration', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip label="MAHLE">
        <button type="button">logo</button>
      </Tooltip>,
    )

    await user.tab()
    await screen.findByText('MAHLE')

    expect(screen.getByRole('button')).toHaveAttribute('aria-describedby')
  })
})
