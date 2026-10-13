import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useClerk, useSignUp } from '@clerk/nextjs'
import { ClerkAPIResponseError } from '@clerk/nextjs/errors'
import { CustomerRole, type CustomerProfileDto } from '@vp-parts-shop/shared'
import { fileCustomer } from '@/lib/api/customers'
import { RegistrationForm } from './registration-form'

jest.mock('@clerk/nextjs', () => ({ useSignUp: jest.fn(), useClerk: jest.fn() }))
jest.mock('@/lib/api/customers', () => ({
  ...jest.requireActual('@/lib/api/customers'),
  fileCustomer: jest.fn(),
}))
jest.mock('./google-sign-up-button', () => ({
  GoogleSignUpButton: ({ redirectUrl }: { redirectUrl?: string }) => (
    <button type="button" data-redirect-url={redirectUrl}>
      Регистрация с Google
    </button>
  ),
}))
const PROFILE: CustomerProfileDto = {
  id: 'customer-1',
  email: 'ivan@example.com',
  firstName: 'Иван',
  lastName: 'Петров',
  phoneNumber: '+359888123456',
  role: CustomerRole.CUSTOMER,
  createdAt: '2026-10-11T10:00:00.000Z',
}

const SUBMIT = 'Създай профил'

interface FakeSignUp {
  status: string
  password: jest.Mock
  finalize: jest.Mock
}

let signUp: FakeSignUp
const getToken = jest.fn()
const mockedFileCustomer = jest.mocked(fileCustomer)

function renderForm(onComplete = jest.fn(), onSignUpStart = jest.fn(), redirectUrl = '/cart') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  render(
    <RegistrationForm
      redirectUrl={redirectUrl}
      onComplete={onComplete}
      onSignUpStart={onSignUpStart}
    />,
    { wrapper },
  )

  return { onComplete, onSignUpStart, queryClient }
}

async function fillAccount(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Име'), 'Иван')
  await user.type(screen.getByLabelText('Фамилия'), 'Петров')
  await user.type(screen.getByLabelText('Имейл'), 'ivan@example.com')
  await user.type(screen.getByLabelText('Парола'), 'correct horse')
  await user.type(screen.getByLabelText('Телефон'), '0888123456')
}

function clerkRefusal(code: string, paramName?: string) {
  return new ClerkAPIResponseError('refused', {
    status: 422,
    data: [{ code, message: code, meta: paramName ? { param_name: paramName } : undefined }],
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  signUp = {
    status: 'missing_requirements',
    password: jest.fn().mockImplementation(async () => {
      signUp.status = 'complete'
      return { error: null }
    }),
    finalize: jest.fn().mockResolvedValue({ error: null }),
  }
  jest.mocked(useSignUp).mockReturnValue({ signUp } as unknown as ReturnType<typeof useSignUp>)
  jest.mocked(useClerk).mockReturnValue({
    session: { getToken },
  } as unknown as ReturnType<typeof useClerk>)
  getToken.mockResolvedValue('fresh-jwt')
  mockedFileCustomer.mockResolvedValue(PROFILE)
})

describe('RegistrationForm', () => {
  // Clerk's bot protection renders its widget into this element.
  it('offers Google above the fields, returning to the same target as the form', () => {
    renderForm(jest.fn(), jest.fn(), '/checkout')

    const google = screen.getByRole('button', { name: 'Регистрация с Google' })

    expect(google).toHaveAttribute('data-redirect-url', '/checkout')
    expect(screen.getByText('или')).toBeInTheDocument()
    expect(
      google.compareDocumentPosition(screen.getByLabelText('Име')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('holds the element Clerk mounts its captcha into', () => {
    renderForm()

    expect(document.getElementById('clerk-captcha')).toBeInTheDocument()
  })

  it('names what is missing and never reaches Clerk with an invalid form', async () => {
    const user = userEvent.setup()
    const { onSignUpStart } = renderForm()

    await user.click(screen.getByRole('button', { name: SUBMIT }))

    expect(screen.getByLabelText('Име')).toHaveAccessibleDescription('Въведете име (без цифри)')
    expect(screen.getByLabelText('Телефон')).toHaveAccessibleDescription(
      'Въведете валиден мобилен номер',
    )
    expect(screen.getByLabelText('Име')).toHaveFocus()
    expect(signUp.password).not.toHaveBeenCalled()
    expect(onSignUpStart).not.toHaveBeenCalled()
  })

  it('refuses a landline before Clerk is asked', async () => {
    const user = userEvent.setup()
    renderForm()

    await fillAccount(user)
    await user.clear(screen.getByLabelText('Телефон'))
    await user.type(screen.getByLabelText('Телефон'), '021234567')
    await user.click(screen.getByRole('button', { name: SUBMIT }))

    expect(signUp.password).not.toHaveBeenCalled()
  })

  it('signs up with the phone in the metadata the API files the customer from', async () => {
    const user = userEvent.setup()
    renderForm()

    await fillAccount(user)
    await user.click(screen.getByRole('button', { name: SUBMIT }))

    await waitFor(() =>
      expect(signUp.password).toHaveBeenCalledWith({
        emailAddress: 'ivan@example.com',
        password: 'correct horse',
        firstName: 'Иван',
        lastName: 'Петров',
        unsafeMetadata: { phoneNumber: '+359888123456' },
      }),
    )
  })

  it('announces the sign-up before asking Clerk', async () => {
    const user = userEvent.setup()
    const { onSignUpStart } = renderForm()

    await fillAccount(user)
    await user.click(screen.getByRole('button', { name: SUBMIT }))

    await waitFor(() => expect(signUp.password).toHaveBeenCalled())
    expect(onSignUpStart.mock.invocationCallOrder[0]).toBeLessThan(
      signUp.password.mock.invocationCallOrder[0],
    )
  })

  it('activates the session, files the customer with its fresh token, then completes', async () => {
    const user = userEvent.setup()
    const { onComplete, queryClient } = renderForm()

    await fillAccount(user)
    await user.click(screen.getByRole('button', { name: SUBMIT }))

    await waitFor(() => expect(onComplete).toHaveBeenCalled())
    expect(signUp.finalize).toHaveBeenCalled()
    expect(mockedFileCustomer).toHaveBeenCalledWith('fresh-jwt')
    expect(queryClient.getQueryData(['customers', 'me'])).toEqual(PROFILE)
  })

  // The account exists by then; the session sync and the webhook file it later.
  it('still completes when filing the customer fails', async () => {
    const user = userEvent.setup()
    jest.spyOn(console, 'error').mockImplementation(() => {})
    mockedFileCustomer.mockRejectedValueOnce(new Error('offline'))
    const { onComplete } = renderForm()

    await fillAccount(user)
    await user.click(screen.getByRole('button', { name: SUBMIT }))

    await waitFor(() => expect(onComplete).toHaveBeenCalled())
  })

  it('shows Clerk’s refusal in Bulgarian under the field it concerns', async () => {
    const user = userEvent.setup()
    signUp.password.mockResolvedValueOnce({
      error: clerkRefusal('form_identifier_exists', 'email_address'),
    })
    const { onComplete } = renderForm()

    await fillAccount(user)
    await user.click(screen.getByRole('button', { name: SUBMIT }))

    await waitFor(() =>
      expect(screen.getByLabelText('Имейл')).toHaveAccessibleDescription(
        'Вече има профил с този имейл. Влезте в него.',
      ),
    )
    expect(signUp.finalize).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('shows a refusal about the whole form above the button', async () => {
    const user = userEvent.setup()
    signUp.password.mockResolvedValueOnce({ error: clerkRefusal('captcha_invalid') })
    renderForm()

    await fillAccount(user)
    await user.click(screen.getByRole('button', { name: SUBMIT }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Проверката срещу ботове не мина. Презаредете страницата и опитайте отново.',
    )
  })

  // E.g. email verification switched on in the Clerk dashboard: this form has no code step.
  it('reports a sign-up Clerk left incomplete as a generic failure', async () => {
    const user = userEvent.setup()
    jest.spyOn(console, 'error').mockImplementation(() => {})
    signUp.password.mockResolvedValueOnce({ error: null })
    const { onComplete } = renderForm()

    await fillAccount(user)
    await user.click(screen.getByRole('button', { name: SUBMIT }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Регистрацията не успя. Опитайте отново.',
    )
    expect(signUp.finalize).not.toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
  })
})
