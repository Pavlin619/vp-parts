import { render, screen, within } from '@testing-library/react'
import { orderDetail } from './order-fixtures'
import { OrderLines } from './order-lines'

describe('OrderLines', () => {
  it('counts the pieces ordered, not the lines', () => {
    render(<OrderLines items={orderDetail().items} />)

    expect(screen.getByRole('heading', { name: 'Поръчани артикули · 5' })).toBeInTheDocument()
  })

  it('lists each part by number and brand, at the prices it was placed at', () => {
    render(<OrderLines items={orderDetail().items} />)

    const [first] = within(screen.getByRole('list', { name: 'Поръчани артикули' })).getAllByRole(
      'listitem',
    )
    expect(within(first).getByText('WIX')).toBeInTheDocument()
    expect(within(first).getByText('Маслен филтър')).toBeInTheDocument()
    expect(within(first).getByText('2 × 12,99 €')).toBeInTheDocument()
    expect(within(first).getByText('25,98 €')).toBeInTheDocument()
  })

  it('links each part to its page by supplier and number', () => {
    render(<OrderLines items={orderDetail().items} />)

    expect(screen.getByRole('link', { name: 'WL6340' })).toHaveAttribute(
      'href',
      '/catalog/articles/268/WL6340',
    )
  })

  it('shows the photo the part was ordered with, and a placeholder where it had none', () => {
    render(<OrderLines items={orderDetail().items} />)

    const [withPhoto, withoutPhoto] = screen.getAllByTestId('article-row-thumbnail')
    expect(withPhoto.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('WL6340.jpg'),
    )
    expect(withoutPhoto.querySelector('img')).toBeNull()
  })
})
