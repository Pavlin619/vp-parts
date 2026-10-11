import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShippingMethod, type DeliveryPlaceDto } from '@vp-parts-shop/shared'
import { AddressFields } from './address-fields'
import { EMPTY_ADDRESS_FORM, type AddressFormValues, type LocatorMode } from './address-form-values'

jest.mock('@/hooks/use-delivery-name-suggestions', () => ({
  useDeliveryNameSuggestions: () => [],
}))

const SOFIA: DeliveryPlaceDto = {
  carrier: ShippingMethod.ECONT,
  id: '41',
  name: 'София',
  region: 'София-град',
  postCode: '1303',
  servingOfficeCode: null,
}

interface HarnessProps {
  initial?: AddressFormValues
  showAllErrors?: boolean
  isRefused?: boolean
  onValuesChange?: (values: AddressFormValues) => void
}

function Harness({
  initial = EMPTY_ADDRESS_FORM,
  showAllErrors = false,
  isRefused = false,
  onValuesChange,
}: HarnessProps) {
  const [values, setValues] = useState(initial)
  const [mode, setMode] = useState<LocatorMode>('street')

  return (
    <AddressFields
      carrier={ShippingMethod.ECONT}
      places={[SOFIA]}
      values={values}
      onValuesChange={(next) => {
        setValues(next)
        onValuesChange?.(next)
      }}
      mode={mode}
      onModeChange={setMode}
      showAllErrors={showAllErrors}
      isRefused={isRefused}
    />
  )
}

describe('AddressFields', () => {
  it('keeps quiet about missing fields until they are left', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    expect(screen.queryByText('Въведи номер')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Улица / бул.'), 'ул. Опълченска')
    await user.tab()

    expect(screen.getByLabelText('Номер')).toHaveAccessibleDescription('Въведи номер')
  })

  it('marks every missing field once the surrounding form asks it to', () => {
    render(<Harness showAllErrors />)

    expect(screen.getByText('Избери населено място от списъка')).toBeInTheDocument()
    expect(screen.getByText('Въведи улица')).toBeInTheDocument()
    expect(screen.getByText('Въведи номер')).toBeInTheDocument()
  })

  it('reports the place picked from the list', async () => {
    const user = userEvent.setup()
    const onValuesChange = jest.fn()
    render(<Harness onValuesChange={onValuesChange} />)

    await user.type(screen.getByRole('searchbox', { name: 'Населено място' }), 'соф')
    await user.click(screen.getByRole('button', { name: /София/ }))

    expect(onValuesChange).toHaveBeenLastCalledWith(expect.objectContaining({ place: SOFIA }))
  })

  it('starts the door over when switching to a quarter, keeping the place', async () => {
    const user = userEvent.setup()
    const onValuesChange = jest.fn()
    render(
      <Harness
        initial={{ ...EMPTY_ADDRESS_FORM, place: SOFIA, street: 'ул. Опълченска' }}
        onValuesChange={onValuesChange}
      />,
    )

    await user.click(screen.getByRole('radio', { name: 'Квартал / ж.к.' }))

    expect(onValuesChange).toHaveBeenLastCalledWith({ ...EMPTY_ADDRESS_FORM, place: SOFIA })
    expect(screen.getByLabelText('Кв. / ж.к.')).toBeInTheDocument()
  })

  it('marks the street when the carrier refused the address', () => {
    render(<Harness isRefused />)

    expect(screen.getByLabelText('Улица / бул.')).toHaveAccessibleDescription(
      'Невалиден адрес. Провери улицата, номера и населеното място.',
    )
  })
})
