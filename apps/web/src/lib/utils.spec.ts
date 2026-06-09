import { cn, formatDate } from './utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('px-2', 'py-2')).toBe('px-2 py-2')
  })

  it('deduplicates conflicting Tailwind classes (last one wins)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('filters falsy values', () => {
    expect(cn('px-2', false && 'py-2', undefined)).toBe('px-2')
  })

  it('handles conditional object syntax', () => {
    expect(cn('base', { active: true, disabled: false })).toBe('base active')
  })
})

describe('formatDate', () => {
  it('formats a Date object in bg-BG locale (dd.mm.yyyy г.)', () => {
    const date = new Date(2024, 0, 15)
    expect(formatDate(date)).toBe('15.01.2024 г.')
  })

  it('formats an ISO date string', () => {
    expect(formatDate('2024-03-07')).toBe('07.03.2024 г.')
  })

  it('pads single-digit day and month with a leading zero', () => {
    const date = new Date(2024, 0, 5)
    expect(formatDate(date)).toBe('05.01.2024 г.')
  })
})
