import { render, screen } from '@testing-library/react'
import { ContactIdentity, initialsOf, profileNameOf } from './contact-identity'

describe('initialsOf', () => {
  it('takes the first letter of the first two words, upper-cased', () => {
    expect(initialsOf('иван петров')).toBe('ИП')
  })

  it('takes one letter from a single word, such as an email shown in place of a name', () => {
    expect(initialsOf('ivan@gmail.com')).toBe('I')
  })
})

describe('profileNameOf', () => {
  it('joins the names the profile holds', () => {
    expect(profileNameOf({ firstName: 'Иван', lastName: 'Петров' })).toBe('Иван Петров')
    expect(profileNameOf({ firstName: 'Иван', lastName: null })).toBe('Иван')
  })

  it('is empty for a profile with no names yet', () => {
    expect(profileNameOf({ firstName: null, lastName: null })).toBe('')
  })
})

describe('ContactIdentity', () => {
  it('shows the name and joins the contact details on one line', () => {
    render(
      <ContactIdentity
        name="Иван Петров"
        details={['ivan@gmail.com', '+359888123456']}
        status="signed-in"
      />,
    )

    expect(screen.getByText('Иван Петров')).toBeInTheDocument()
    expect(screen.getByText('ivan@gmail.com · +359888123456')).toBeInTheDocument()
    expect(screen.getByText('Влязъл')).toBeInTheDocument()
  })

  it('flags an account that still has no phone', () => {
    render(<ContactIdentity name="Иван Петров" details={['ivan@gmail.com']} status="phone-missing" />)

    expect(screen.getByText('Липсва телефон')).toBeInTheDocument()
    expect(screen.queryByText('Влязъл')).not.toBeInTheDocument()
  })

  it('flags an account that is missing more than the phone', () => {
    render(<ContactIdentity name="ivan@gmail.com" details={[]} status="details-missing" />)

    expect(screen.getByText('Непълен профил')).toBeInTheDocument()
  })
})
