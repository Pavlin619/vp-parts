import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmailCodeStep, RESEND_COOLDOWN_SECONDS } from './email-code-step'

const CODE = 'Код от имейла'
const VERIFY = 'Потвърди'
const RESEND = 'Изпрати нов код'

function renderStep({
  onVerify = jest.fn().mockResolvedValue(null),
  onResend = jest.fn().mockResolvedValue(null),
  onChangeEmail = jest.fn(),
} = {}) {
  render(
    <EmailCodeStep
      email="ivan@example.com"
      onVerify={onVerify}
      onResend={onResend}
      onChangeEmail={onChangeEmail}
    />,
  )

  return { onVerify, onResend, onChangeEmail }
}

function waitOutCooldown() {
  act(() => jest.advanceTimersByTime(RESEND_COOLDOWN_SECONDS * 1000))
}

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('EmailCodeStep', () => {
  const setupUser = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime })

  it('says where the code went', () => {
    renderStep()

    expect(screen.getByText(/ivan@example\.com/)).toBeInTheDocument()
  })

  it('verifies only once six digits are in', async () => {
    const user = setupUser()
    const { onVerify } = renderStep()

    await user.type(screen.getByLabelText(CODE), '12345')
    expect(screen.getByRole('button', { name: VERIFY })).toBeDisabled()

    await user.type(screen.getByLabelText(CODE), '6')
    await user.click(screen.getByRole('button', { name: VERIFY }))

    expect(onVerify).toHaveBeenCalledWith('123456')
  })

  it('keeps only the digits of a pasted code', async () => {
    const user = setupUser()
    renderStep()

    await user.click(screen.getByLabelText(CODE))
    await user.paste('123 456 789')

    expect(screen.getByLabelText(CODE)).toHaveValue('123456')
  })

  it('shows that it is checking while the code is verified', async () => {
    const user = setupUser()
    renderStep({ onVerify: jest.fn(() => new Promise<null>(() => {})) })

    await user.type(screen.getByLabelText(CODE), '123456')
    await user.click(screen.getByRole('button', { name: VERIFY }))

    expect(screen.getByRole('button', { name: 'Проверяваме…' })).toBeDisabled()
  })

  it('shows a refused code under the field and lets the customer try again', async () => {
    const user = setupUser()
    const onVerify = jest.fn().mockResolvedValueOnce('Грешен код.')
    renderStep({ onVerify })

    await user.type(screen.getByLabelText(CODE), '123456')
    await user.click(screen.getByRole('button', { name: VERIFY }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Грешен код.')
    expect(screen.getByRole('button', { name: VERIFY })).toBeEnabled()
  })

  it('waits out the cooldown before a new code can be sent', async () => {
    const user = setupUser()
    const { onResend } = renderStep()

    expect(
      screen.getByRole('button', { name: `${RESEND} след ${RESEND_COOLDOWN_SECONDS} с` }),
    ).toBeDisabled()

    waitOutCooldown()
    await user.click(screen.getByRole('button', { name: RESEND }))

    expect(onResend).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Изпратихме нов код.')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: `${RESEND} след ${RESEND_COOLDOWN_SECONDS} с` }),
    ).toBeDisabled()
  })

  it('shows why a new code could not be sent', async () => {
    const user = setupUser()
    renderStep({ onResend: jest.fn().mockResolvedValue('Твърде много опити.') })

    waitOutCooldown()
    await user.click(screen.getByRole('button', { name: RESEND }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Твърде много опити.'))
  })

  it('goes back to change the email', async () => {
    const user = setupUser()
    const { onChangeEmail } = renderStep()

    await user.click(screen.getByRole('button', { name: 'Промени имейла' }))

    expect(onChangeEmail).toHaveBeenCalled()
  })
})
