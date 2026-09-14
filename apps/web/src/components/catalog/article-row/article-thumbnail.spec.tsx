import { fireEvent, render, screen } from '@testing-library/react'
import { ArticleThumbnail } from './article-thumbnail'

describe('ArticleThumbnail', () => {
  it('shows the supplier photo when there is one', () => {
    render(
      <ArticleThumbnail
        href="/catalog/articles/268/WL6340"
        thumbnailUrl="https://images.example/wl6340.jpg"
      />,
    )

    expect(screen.getByRole('presentation', { hidden: true })).toBeInTheDocument()
  })

  // An image host we have not registered in `next.config.ts` fails exactly this
  // way, and an empty frame reads as a broken page.
  it('falls back to the wordless placeholder when the photo fails', () => {
    const { container } = render(
      <ArticleThumbnail href="/x" thumbnailUrl="https://images.example/gone.jpg" />,
    )

    const image = container.querySelector('img')
    expect(image).not.toBeNull()
    fireEvent.error(image as HTMLImageElement)

    expect(container.querySelector('img')).toBeNull()
  })

  // The article number beside it is the accessible link to the same page.
  it('stays out of the tab order', () => {
    render(<ArticleThumbnail href="/x" thumbnailUrl={null} />)

    expect(screen.getByTestId('article-row-thumbnail')).toHaveAttribute(
      'tabindex',
      '-1',
    )
  })
})
