import { existsSync } from 'fs'
import { join } from 'path'
import {
  CATEGORY_ILLUSTRATION_FILES,
  categoryIllustrationSrc,
} from './category-illustration'

const ILLUSTRATION_DIRECTORY = join(
  __dirname,
  '..',
  '..',
  '..',
  'public',
  'category-illustrations',
)

describe('categoryIllustrationSrc', () => {
  // The whole point of the manifest: an unregistered root is a designed neutral
  // tile, not a broken image, so the catalogue page renders before any art
  // exists and each illustration can land on its own.
  it('reports no illustration for a category that has none bundled', () => {
    expect(categoryIllustrationSrc('999999')).toBeNull()
  })

  it('resolves a registered category to a path under the public directory', () => {
    for (const [nodeId, file] of Object.entries(CATEGORY_ILLUSTRATION_FILES)) {
      expect(categoryIllustrationSrc(nodeId)).toBe(
        `/category-illustrations/${file}`,
      )
    }
  })

  // The manifest is explicit rather than derived from the filename so a missing
  // asset cannot cost a 404 per tile, which only holds while every entry names
  // a file that is really there.
  it('registers only files that exist on disk', () => {
    const missing = Object.values(CATEGORY_ILLUSTRATION_FILES).filter(
      (file) => !existsSync(join(ILLUSTRATION_DIRECTORY, file)),
    )

    expect(missing).toEqual([])
  })

  it('has somewhere to put the assets', () => {
    expect(existsSync(ILLUSTRATION_DIRECTORY)).toBe(true)
  })

  // Keyed on the TecDoc assemblyGroupNodeId, so anything non-numeric is a name
  // or a slug that crept in — and names are not unique across the tree.
  it('is keyed on numeric TecDoc assembly group node ids', () => {
    for (const nodeId of Object.keys(CATEGORY_ILLUSTRATION_FILES)) {
      expect(nodeId).toMatch(/^\d+$/)
    }
  })

  it('registers only prepared WebP assets', () => {
    for (const file of Object.values(CATEGORY_ILLUSTRATION_FILES)) {
      expect(file).toMatch(/\.webp$/)
    }
  })

  /**
   * Only roots are illustrated, and there are 36 of them catalogue-wide. A
   * manifest that outgrew that is one that started illustrating level 2, where
   * the bound is 490 and rising — see `docs/TECDOC.md`.
   */
  it('stays within the bounded root set', () => {
    expect(Object.keys(CATEGORY_ILLUSTRATION_FILES).length).toBeLessThanOrEqual(
      36,
    )
  })
})
