import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddressReview } from './address-review'

const SUGGESTION = {
  kind: 'suggestion',
  typedLabel: 'ул. Витоша 1, София',
  suggestedLabel: 'бул. Витоша 1, 1303 София',
} as const

describe('AddressReview', () => {
  it('shows what was typed beside the carrier suggestion', () => {
    render(
      <AddressReview
        review={SUGGESTION}
        carrierName="Еконт"
        onAcceptSuggestion={jest.fn()}
        onKeepTyped={jest.fn()}
      />,
    )

    expect(screen.getByText('Еконт предлага корекция на адреса')).toBeInTheDocument()
    expect(screen.getByText(SUGGESTION.typedLabel)).toBeInTheDocument()
    expect(screen.getByText(SUGGESTION.suggestedLabel)).toBeInTheDocument()
  })

  it('lets the customer take either address', async () => {
    const onAcceptSuggestion = jest.fn()
    const onKeepTyped = jest.fn()
    render(
      <AddressReview
        review={SUGGESTION}
        carrierName="Еконт"
        onAcceptSuggestion={onAcceptSuggestion}
        onKeepTyped={onKeepTyped}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Запази моя адрес' }))
    await userEvent.click(screen.getByRole('button', { name: /Използвай предложението/ }))

    expect(onKeepTyped).toHaveBeenCalledTimes(1)
    expect(onAcceptSuggestion).toHaveBeenCalledTimes(1)
  })

  it('says the address could not be checked when the carrier is unreachable', () => {
    render(
      <AddressReview
        review={{ kind: 'unavailable' }}
        carrierName="Еконт"
        onAcceptSuggestion={jest.fn()}
        onKeepTyped={jest.fn()}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Не успяхме да проверим адреса')
  })
})
