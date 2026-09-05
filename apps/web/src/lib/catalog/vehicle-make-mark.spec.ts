import { existsSync } from 'fs'
import { join } from 'path'
import { VEHICLE_MAKE_LOGO_FILES, vehicleMakeLogoSrc } from './vehicle-make-mark'

const LOGO_DIRECTORY = join(__dirname, '..', '..', '..', 'public', 'vehicle-makes')

describe('vehicleMakeLogoSrc', () => {
  it('reports no logo for a make that has none bundled', () => {
    expect(vehicleMakeLogoSrc('999999')).toBeNull()
  })

  it('resolves a registered make to a path under the public logo directory', () => {
    for (const [manufacturerId, file] of Object.entries(VEHICLE_MAKE_LOGO_FILES)) {
      expect(vehicleMakeLogoSrc(manufacturerId)).toBe(`/vehicle-makes/${file}`)
    }
  })

  // The manifest exists to keep a missing asset from costing a 404 on every
  // card, which only holds while every entry names a file that is really there.
  it('registers only files that exist on disk', () => {
    const missing = Object.values(VEHICLE_MAKE_LOGO_FILES).filter(
      (file) => !existsSync(join(LOGO_DIRECTORY, file)),
    )

    expect(missing).toEqual([])
  })

  // Keyed on the TecDoc mfrId, so anything non-numeric is a name that crept in.
  it('is keyed on numeric TecDoc manufacturer ids', () => {
    for (const manufacturerId of Object.keys(VEHICLE_MAKE_LOGO_FILES)) {
      expect(manufacturerId).toMatch(/^\d+$/)
    }
  })

  // The component serves every mark `unoptimized`, which is only affordable
  // while each file is already tile-sized. A raw `.png` here would be the
  // untrimmed 1920px source the fetch script exists to cut down.
  it('registers only prepared WebP assets', () => {
    for (const file of Object.values(VEHICLE_MAKE_LOGO_FILES)) {
      expect(file).toMatch(/\.webp$/)
    }
  })

  // Ford's regional arms wear the blue oval and Renault Trucks the Renault
  // lozenge, so a shared file is intended. This pins that it stays the
  // exception — a wholesale collapse would mean the manifest lost its ids.
  it('gives all but a handful of makes a badge of their own', () => {
    const files = Object.values(VEHICLE_MAKE_LOGO_FILES)
    const shared = files.length - new Set(files).size

    expect(shared).toBeLessThanOrEqual(5)
  })
})