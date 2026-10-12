import { ClerkAPIResponseError } from '@clerk/nextjs/errors'
import { describeSignUpError, isClerkRateLimited, SIGN_UP_FAILED_MESSAGE } from './clerk-errors'

function apiError(code: string, paramName?: string): ClerkAPIResponseError {
  return new ClerkAPIResponseError('Clerk refused the sign-up', {
    status: 422,
    data: [{ code, message: code, meta: paramName ? { param_name: paramName } : undefined }],
  })
}

describe('describeSignUpError', () => {
  it('points a taken email at the email field', () => {
    expect(describeSignUpError(apiError('form_identifier_exists', 'email_address'))).toEqual({
      field: 'email',
      message: 'Вече има профил с този имейл. Влезте в него.',
    })
  })

  it.each([
    ['form_password_pwned', 'Тази парола е изтекла при пробив в друг сайт. Изберете друга.'],
    ['form_password_length_too_short', 'Паролата трябва да е поне 8 символа.'],
    ['form_password_not_strong_enough', 'Паролата е твърде слаба. Добавете още символи.'],
  ])('points %s at the password field', (code, message) => {
    expect(describeSignUpError(apiError(code, 'password'))).toEqual({ field: 'password', message })
  })

  it('places a malformed parameter on the field Clerk names', () => {
    expect(describeSignUpError(apiError('form_param_format_invalid', 'email_address'))).toEqual({
      field: 'email',
      message: 'Въведете валиден имейл',
    })
  })

  it('reports a malformed parameter on a field the form does not have as a whole-form error', () => {
    expect(describeSignUpError(apiError('form_param_format_invalid', 'username'))).toEqual({
      field: null,
      message: SIGN_UP_FAILED_MESSAGE,
    })
  })

  it.each(['captcha_invalid', 'captcha_unavailable', 'captcha_missing_token'])(
    'asks for a reload when the bot check fails with %s',
    (code) => {
      expect(describeSignUpError(apiError(code))).toEqual({
        field: null,
        message: 'Проверката срещу ботове не мина. Презаредете страницата и опитайте отново.',
      })
    },
  )

  it('asks to wait after too many attempts', () => {
    expect(describeSignUpError(apiError('too_many_requests')).message).toBe(
      'Твърде много опити. Опитайте отново след малко.',
    )
  })

  it('falls back to a generic message for a code it does not know', () => {
    expect(describeSignUpError(apiError('something_new'))).toEqual({
      field: null,
      message: SIGN_UP_FAILED_MESSAGE,
    })
  })

  it('falls back to a generic message for an error that is not Clerk’s', () => {
    expect(describeSignUpError(new Error('offline'))).toEqual({
      field: null,
      message: SIGN_UP_FAILED_MESSAGE,
    })
  })
})

describe('isClerkRateLimited', () => {
  it('recognises Clerk refusing too many attempts', () => {
    expect(isClerkRateLimited(apiError('too_many_requests'))).toBe(true)
  })

  it.each([
    ['another Clerk refusal', apiError('form_param_format_invalid')],
    ['an error that is not Clerk’s', new Error('offline')],
  ])('is false for %s', (_case, error) => {
    expect(isClerkRateLimited(error)).toBe(false)
  })
})
