import { render, screen } from '@testing-library/react'
import { ArticleIdentity } from './article-identity'

describe('ArticleIdentity', () => {
  it('links the number to the part and keeps the description readable', () => {
    render(
      <ArticleIdentity
        href="/catalog/articles/268/WL6340"
        articleNumber="WL6340"
        description="Маслен филтър"
      />,
    )

    expect(screen.getByRole('link', { name: 'WL6340' })).toHaveAttribute(
      'href',
      '/catalog/articles/268/WL6340',
    )
    // Clamped to two lines, so the full text has to stay reachable on hover.
    expect(screen.getByText('Маслен филтър')).toHaveAttribute(
      'title',
      'Маслен филтър',
    )
  })

  it('renders the supporting line only when there is one', () => {
    const { rerender } = render(
      <ArticleIdentity
        href="/x"
        articleNumber="WL6340"
        description="Маслен филтър"
        meta="WIX"
      />,
    )
    expect(screen.getByText('WIX')).toBeInTheDocument()

    rerender(
      <ArticleIdentity href="/x" articleNumber="WL6340" description="Маслен филтър" meta="" />,
    )
    expect(screen.queryByText('WIX')).not.toBeInTheDocument()
  })

  // Counter staff paste these into supplier systems all day.
  it('offers the number for copying', () => {
    render(
      <ArticleIdentity href="/x" articleNumber="WL6340" description="Маслен филтър" />,
    )

    expect(
      screen.getByRole('button', { name: 'Копирай номер WL6340' }),
    ).toBeInTheDocument()
  })
})
