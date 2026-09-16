import { formatDisplacement, formatEngineCodes, formatPower } from './vehicle-specs'

describe('formatPower', () => {
  it('leads with kilowatts and carries horsepower alongside', () => {
    expect(formatPower(110, 150)).toBe('110 kW (150 к.с.)')
  })

  // The XSD marks horsePowerFrom optional, and "(undefined к.с.)" is worse
  // than showing kilowatts alone.
  it('falls back to kilowatts alone when horsepower is missing', () => {
    expect(formatPower(110, null)).toBe('110 kW')
    expect(formatPower(110, undefined as unknown as null)).toBe('110 kW')
  })
})

describe('formatDisplacement', () => {
  // TecDoc sends a 2.0-litre engine as the number 2, which renders as "2 л"
  // unless the decimal is forced.
  it('always shows one decimal place', () => {
    expect(formatDisplacement(2)).toBe('2.0 л')
    expect(formatDisplacement(1.4)).toBe('1.4 л')
  })

  it('rounds to one decimal place', () => {
    expect(formatDisplacement(2.143)).toBe('2.1 л')
  })

  it('has nothing to show for a variant with no displacement', () => {
    expect(formatDisplacement(null)).toBeNull()
  })

  it('has nothing to show when the field is absent altogether', () => {
    expect(formatDisplacement(undefined as unknown as null)).toBeNull()
  })
})

describe('formatEngineCodes', () => {
  it('reads a single code as itself', () => {
    expect(formatEngineCodes(['N47D20C'])).toBe('N47D20C')
  })

  // A third of vehicles are built with more than one engine, and the visitor is
  // matching this against the code on the block in front of them — the first
  // alone is a sibling's engine as often as it is theirs.
  it('joins every code a vehicle was built with', () => {
    expect(formatEngineCodes(['OM 642.852', 'OM 642.850'])).toBe(
      'OM 642.852, OM 642.850',
    )
  })

  it('has nothing to show for a vehicle with no code filed', () => {
    expect(formatEngineCodes([])).toBeNull()
  })

  // Variants are cached for a day and the two apps deploy separately, so the
  // browser can be newer than the entry answering it.
  it('has nothing to show when the field is absent altogether', () => {
    expect(formatEngineCodes(undefined)).toBeNull()
  })
})
