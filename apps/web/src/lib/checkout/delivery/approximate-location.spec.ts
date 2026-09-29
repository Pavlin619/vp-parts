import { approximateLocationOf } from './approximate-location'

function headers(values: Record<string, string>) {
  return { get: (name: string) => values[name] ?? null }
}

const PLOVDIV = {
  'x-vercel-ip-country': 'BG',
  'x-vercel-ip-city': 'Plovdiv',
  'x-vercel-ip-latitude': '42.1497',
  'x-vercel-ip-longitude': '24.7475',
}

describe('approximateLocationOf', () => {
  it('reads where Vercel places the request', () => {
    expect(approximateLocationOf(headers(PLOVDIV))).toEqual({
      latitude: 42.1497,
      longitude: 24.7475,
    })
  })

  it('knows nothing outside Bulgaria', () => {
    expect(approximateLocationOf(headers({ ...PLOVDIV, 'x-vercel-ip-country': 'RO' }))).toBeNull()
  })

  // Without a city the geo database answers the middle of the country, which is no one's town.
  it('knows nothing when it cannot name the city', () => {
    expect(approximateLocationOf(headers({ ...PLOVDIV, 'x-vercel-ip-city': '' }))).toBeNull()
  })

  it.each([
    ['missing', { 'x-vercel-ip-latitude': '' }],
    ['not a number', { 'x-vercel-ip-longitude': 'east' }],
  ])('knows nothing when a coordinate is %s', (_case, broken) => {
    expect(approximateLocationOf(headers({ ...PLOVDIV, ...broken }))).toBeNull()
  })

  it('knows nothing off Vercel, where the headers are not set', () => {
    expect(approximateLocationOf(headers({}))).toBeNull()
  })
})
