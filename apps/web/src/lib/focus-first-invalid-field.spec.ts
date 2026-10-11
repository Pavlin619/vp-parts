import { focusFirstInvalidField } from './focus-first-invalid-field'

function mount(html: string): HTMLElement {
  const container = document.createElement('form')
  container.innerHTML = html
  document.body.replaceChildren(container)

  return container
}

describe('focusFirstInvalidField', () => {
  it('focuses the first input marked invalid', () => {
    const form = mount(
      '<input id="a" /><input id="b" aria-invalid="true" /><input id="c" aria-invalid="true" />',
    )

    focusFirstInvalidField(form)

    expect(document.activeElement?.id).toBe('b')
  })

  it('reaches into a group marked invalid, such as the place picker', () => {
    const form = mount('<div data-invalid="true"><input id="place" /></div><input id="d" />')

    focusFirstInvalidField(form)

    expect(document.activeElement?.id).toBe('place')
  })

  it('does nothing without a form or an invalid field', () => {
    const form = mount('<input id="a" />')

    expect(() => focusFirstInvalidField(null)).not.toThrow()
    focusFirstInvalidField(form)

    expect(document.activeElement).toBe(document.body)
  })
})
