import { render, screen } from '@testing-library/react'
import { ContactIdentity, initialsOf } from './contact-identity'

describe('initialsOf', () => {
  it('takes the first letter of each name, upper-cased', () => {
    expect(initialsOf('иван', 'петров')).toBe('ИП')
  })

  it('leaves out a missing name', () => {
    expect(initialsOf('Иван', '')).toBe('И')
  })
})

describe('ContactIdentity', () => {
  it('shows the name and joins the contact details on one line', () => {
    render(
      <ContactIdentity
        firstName="Иван"
        lastName="Петров"
        details={['ivan@gmail.com', '+359888123456']}
        status="signed-in"
      />,
    )

    expect(screen.getByText('Иван Петров')).toBeInTheDocument()
    expect(screen.getByText('ivan@gmail.com · +359888123456')).toBeInTheDocument()
    expect(screen.getByText('Влязъл')).toBeInTheDocument()
  })

  it('flags an account that still has no phone', () => {
    render(
      <ContactIdentity
        firstName="Иван"
        lastName="Петров"
        details={['ivan@gmail.com']}
        status="phone-missing"
      />,
    )

    expect(screen.getByText('Липсва телефон')).toBeInTheDocument()
    expect(screen.queryByText('Влязъл')).not.toBeInTheDocument()
  })
})
