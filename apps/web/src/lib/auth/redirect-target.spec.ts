import { sameOriginPath } from './redirect-target'

const ORIGIN = 'https://vp-parts.bg'

describe('sameOriginPath', () => {
  it('keeps a path on this site, with its query and hash', () => {
    expect(sameOriginPath('/checkout?step=2#contact', ORIGIN)).toBe('/checkout?step=2#contact')
  })

  // Clerk hands redirect_url over as an absolute URL.
  it('reduces an absolute URL on this site to its path', () => {
    expect(sameOriginPath('https://vp-parts.bg/cart', ORIGIN)).toBe('/cart')
  })

  it.each([
    'https://evil.example/phish',
    '//evil.example/phish',
    '/\\evil.example',
    'javascript:alert(1)',
    'https://vp-parts.bg//evil.example',
    '/.//evil.example',
    '/%2e//evil.example',
  ])('sends %s home instead of off the site', (target) => {
    expect(sameOriginPath(target, ORIGIN)).toBe('/')
  })

  it('goes home without a target', () => {
    expect(sameOriginPath(undefined, ORIGIN)).toBe('/')
    expect(sameOriginPath('', ORIGIN)).toBe('/')
  })
})
