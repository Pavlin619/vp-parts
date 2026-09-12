import type { ArticleCategoryNodeDto } from '@vp-parts-shop/shared'
import {
  buildArticleBreadcrumbs,
  selectArticleCategoryPath,
} from './article-breadcrumbs'

// ── Helpers ──────────────────────────────────────────────────────────────────

function path(
  ...steps: Array<[string, string]>
): ArticleCategoryNodeDto[] {
  return steps.map(([id, label]) => ({ id, label }))
}

/** What the live catalogue answers for MAHLE OX 389/1D. */
const OIL_FILTER_PATHS = [
  path(['100005', 'филтър'], ['100259', 'маслен филтър']),
  path(
    ['100002', 'двигател'],
    ['100245', 'смазване'],
    ['100470', 'маслен филтър'],
  ),
  path(
    ['100019', 'части за сервиз'],
    ['100597', 'Периодична подмяна'],
  ),
]

const labels = (items: Array<{ label: string }>) =>
  items.map((item) => item.label)

const hrefOf = (
  crumbs: Array<{ label: string; href?: string }>,
  label: string,
) => crumbs.find((crumb) => crumb.label === label)?.href

const paramsOf = (href: string) => new URLSearchParams(href.split('?')[1])

// ── Tests ────────────────────────────────────────────────────────────────────

describe('selectArticleCategoryPath', () => {
  // TecDoc's tree is several axes flattened into one, so an article has no
  // single home. The shortest trail is the one that says what the part is —
  // "филтър › маслен филтър" rather than the route through the engine or the
  // service schedule.
  it('takes the shortest trail when nothing says where the visitor came from', () => {
    expect(labels(selectArticleCategoryPath(OIL_FILTER_PATHS))).toEqual([
      'филтър',
      'маслен филтър',
    ])
  })

  it('takes the trail the visitor drilled when one is named', () => {
    expect(
      labels(selectArticleCategoryPath(OIL_FILTER_PATHS, '100245')),
    ).toEqual(['двигател', 'смазване', 'маслен филтър'])
  })

  it('matches a category anywhere along a trail, not only its end', () => {
    expect(
      labels(selectArticleCategoryPath(OIL_FILTER_PATHS, '100019')),
    ).toEqual(['части за сервиз', 'Периодична подмяна'])
  })

  // A category the article is not filed under says nothing about which trail to
  // show, so the default rule answers rather than an empty one.
  it('falls back when the named category is on no trail', () => {
    expect(
      labels(selectArticleCategoryPath(OIL_FILTER_PATHS, '999999')),
    ).toEqual(['филтър', 'маслен филтър'])
  })

  it('has nothing to select from an article TecDoc files under nothing', () => {
    expect(selectArticleCategoryPath([])).toEqual([])
  })

  // Two trails of one length would otherwise depend on the order TecDoc
  // happened to return them in, and the page is cached — so one visitor's trail
  // would outlive the read that chose it.
  it('breaks a tie the same way every time', () => {
    const tied = [
      path(['2', 'окачване'], ['20', 'пружина']),
      path(['1', 'спирачки'], ['10', 'диск']),
    ]

    expect(labels(selectArticleCategoryPath(tied))).toEqual([
      'окачване',
      'пружина',
    ])
    expect(labels(selectArticleCategoryPath([...tied].reverse()))).toEqual([
      'окачване',
      'пружина',
    ])
  })
})

describe('buildArticleBreadcrumbs', () => {
  it('runs from the home page down to the part on screen', () => {
    const crumbs = buildArticleBreadcrumbs({
      categoryPaths: OIL_FILTER_PATHS,
      brandName: 'MAHLE',
      articleNumber: 'OX 389/1D',
    })

    expect(labels(crumbs)).toEqual([
      'Начало',
      'Всички категории',
      'филтър',
      'маслен филтър',
      'MAHLE OX 389/1D',
    ])
  })

  it('links home and the catalogue root', () => {
    const crumbs = buildArticleBreadcrumbs({
      categoryPaths: OIL_FILTER_PATHS,
      brandName: 'MAHLE',
      articleNumber: 'OX 389/1D',
    })

    expect(crumbs[0].href).toBe('/')
    expect(crumbs[1].href).toBe('/catalog')
  })

  // A category the trail runs through has something under it, so the catalogue
  // can open it: the root's card with the drill panel already inside.
  it('opens the catalogue inside every category above the last', () => {
    const crumbs = buildArticleBreadcrumbs({
      categoryPaths: OIL_FILTER_PATHS,
      brandName: 'MAHLE',
      articleNumber: 'OX 389/1D',
      categoryNodeId: '100245',
    })

    expect(hrefOf(crumbs, 'двигател')).toBe('/catalog?category=100002')
    expect(hrefOf(crumbs, 'смазване')).toBe('/catalog?category=100245')
  })

  // The last category is where TecDoc files the part, so its listing is the one
  // search certain to contain the article the visitor is looking at.
  it('sends the category the part is filed under to its listing', () => {
    const crumbs = buildArticleBreadcrumbs({
      categoryPaths: OIL_FILTER_PATHS,
      brandName: 'MAHLE',
      articleNumber: 'OX 389/1D',
    })
    const params = paramsOf(hrefOf(crumbs, 'маслен филтър')!)

    expect(params.getAll('cat')).toEqual(['100005', '100259'])
    expect(params.get('q')).toBe('')
    expect(params.has('vehicleId')).toBe(false)
  })

  // The saved car never scopes a search on its own, so the listing is only
  // narrowed when the article was being read for a car.
  it('keeps the car the article arrived scoped to', () => {
    const crumbs = buildArticleBreadcrumbs({
      categoryPaths: OIL_FILTER_PATHS,
      brandName: 'MAHLE',
      articleNumber: 'OX 389/1D',
      vehicleId: '13074',
    })

    expect(paramsOf(hrefOf(crumbs, 'маслен филтър')!).get('vehicleId')).toBe(
      '13074',
    )
  })

  // A single-step trail is both the first category and the last, and what it
  // means is "where the part is filed" rather than "a root to browse".
  it('reads a one-step trail as the listing', () => {
    const crumbs = buildArticleBreadcrumbs({
      categoryPaths: [path(['100342', 'почистване на фаровете'])],
      brandName: 'MAHLE',
      articleNumber: 'OX 389/1D',
    })

    expect(
      paramsOf(hrefOf(crumbs, 'почистване на фаровете')!).getAll('cat'),
    ).toEqual(['100342'])
  })

  it('leaves the part itself as text rather than a link to this page', () => {
    const crumbs = buildArticleBreadcrumbs({
      categoryPaths: OIL_FILTER_PATHS,
      brandName: 'MAHLE',
      articleNumber: 'OX 389/1D',
    })

    expect(crumbs.at(-1)?.href).toBeUndefined()
  })

  it('continues the trail the visitor drilled', () => {
    const crumbs = buildArticleBreadcrumbs({
      categoryPaths: OIL_FILTER_PATHS,
      brandName: 'MAHLE',
      articleNumber: 'OX 389/1D',
      categoryNodeId: '100245',
    })

    expect(labels(crumbs)).toEqual([
      'Начало',
      'Всички категории',
      'двигател',
      'смазване',
      'маслен филтър',
      'MAHLE OX 389/1D',
    ])
  })

  // An article TecDoc files under no category still has a place to go back to.
  it('keeps the catalogue root when there is no trail', () => {
    const crumbs = buildArticleBreadcrumbs({
      categoryPaths: [],
      brandName: 'MAHLE',
      articleNumber: 'OX 389/1D',
    })

    expect(labels(crumbs)).toEqual([
      'Начало',
      'Всички категории',
      'MAHLE OX 389/1D',
    ])
    expect(crumbs[1].href).toBe('/catalog')
  })

  // Two brands file one number, so the number alone does not name the part.
  it('names the part by brand and number', () => {
    const crumbs = buildArticleBreadcrumbs({
      categoryPaths: [],
      brandName: 'KNECHT',
      articleNumber: 'OX 389/1D',
    })

    expect(crumbs.at(-1)?.label).toBe('KNECHT OX 389/1D')
  })
})
