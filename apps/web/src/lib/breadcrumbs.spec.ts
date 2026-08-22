import { markLastAsCurrent, type BreadcrumbItem } from './breadcrumbs'

const crumb = (key: string, href?: string): BreadcrumbItem => ({
  key,
  label: key,
  href,
})

describe('markLastAsCurrent', () => {
  it('unlinks the last crumb and leaves the rest alone', () => {
    const trail = markLastAsCurrent([
      crumb('home', '/'),
      crumb('parts', '/catalog'),
      crumb('filters', '/catalog/filters'),
    ])

    expect(trail.map((item) => item.href)).toEqual([
      '/',
      '/catalog',
      undefined,
    ])
  })

  it('unlinks a lone crumb', () => {
    expect(markLastAsCurrent([crumb('home', '/')])[0].href).toBeUndefined()
  })

  it('tolerates an empty trail', () => {
    expect(markLastAsCurrent([])).toEqual([])
  })
})
