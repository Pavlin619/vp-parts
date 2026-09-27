import { render, screen } from '@testing-library/react'
import { DeviceLocationNotice } from './device-location-notice'

describe('DeviceLocationNotice', () => {
  it.each([
    ['denied', 'Нямаме достъп до местоположението ви. Потърсете по град или адрес.'],
    ['unavailable', 'Не успяхме да определим местоположението ви. Потърсете по град или адрес.'],
  ] as const)('says why the customer could not be located (%s)', (status, copy) => {
    render(<DeviceLocationNotice status={status} />)

    expect(screen.getByRole('alert')).toHaveTextContent(copy)
  })

  it.each(['idle', 'locating'] as const)('says nothing while %s', (status) => {
    const { container } = render(<DeviceLocationNotice status={status} />)

    expect(container).toBeEmptyDOMElement()
  })
})
