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

  // Only the home page exists to link to today. The category crumbs get their
  // hrefs when the catalogue page does; a link to nowhere is worse than text.
  it('links home and nothing else', () => {
    const crumbs = buildArticleBreadcrumbs({
      categoryPaths: OIL_FILTER_PATHS,
      brandName: 'MAHLE',
      articleNumber: 'OX 389/1D',
    })

    expect(crumbs[0].href).toBe('/')
    expect(crumbs.slice(1).every((crumb) => crumb.href === undefined)).toBe(
      true,
    )
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
