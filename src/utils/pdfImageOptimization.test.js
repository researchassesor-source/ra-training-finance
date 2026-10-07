import { afterEach, describe, expect, it, vi } from 'vitest'
import { fitInstitutionalLogoForPdf } from './pdfImageOptimization.js'

afterEach(() => vi.restoreAllMocks())

describe('logotipo institucional para PDF', () => {
  it('no modifica los recursos pequeños', async () => {
    const original = 'data:image/png;base64,AAAA'
    expect(await fitInstitutionalLogoForPdf(original)).toBe(original)
  })

  it('reduce un recurso grande manteniendo transparencia y proporciones', async () => {
    const original = `data:image/png;base64,${'A'.repeat(600_000)}`
    const image = { naturalWidth: 2400, naturalHeight: 1200, decode: vi.fn().mockResolvedValue() }
    vi.stubGlobal('Image', class { constructor() { return image } })
    const context = { drawImage: vi.fn(), imageSmoothingEnabled: false, imageSmoothingQuality: '' }
    const canvas = { width: 0, height: 0, getContext: vi.fn().mockReturnValue(context),
      toDataURL: vi.fn().mockReturnValue('data:image/png;base64,AAAA') }
    const create = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(tag => tag === 'canvas' ? canvas : create(tag))

    expect(await fitInstitutionalLogoForPdf(original)).toBe('data:image/png;base64,AAAA')
    expect(canvas.width).toBe(800)
    expect(canvas.height).toBe(400)
    expect(canvas.getContext).toHaveBeenCalledWith('2d', { alpha: true })
    expect(context.drawImage).toHaveBeenCalledWith(image, 0, 0, 800, 400)
  })
})
