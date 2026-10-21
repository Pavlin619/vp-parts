import { useRegistrationDraft } from './use-registration-draft'

const { getState } = useRegistrationDraft

describe('useRegistrationDraft', () => {
  it('holds the details handed over until they are cleared', () => {
    getState().setDraft({ firstName: 'Мария', phoneNumber: '+359888765432' })

    expect(getState().draft).toEqual({ firstName: 'Мария', phoneNumber: '+359888765432' })

    getState().clear()

    expect(getState().draft).toEqual({})
  })
})
