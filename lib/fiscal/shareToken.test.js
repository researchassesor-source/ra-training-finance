import { describe, expect, it, vi } from 'vitest'
import { createFiscalDocumentToken, verifyFiscalDocumentToken } from './shareToken.js'

describe('fiscal document share token', () => {
  it('firma links temporales para RIDE/XML y permite verificarlos sin exponer secretos', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-31T12:00:00.000Z'))
    const token = createFiscalDocumentToken({ facturaId: 'FACT-1', tipo: 'RIDE', expiresInSeconds: 60 }, 'secret-share')
    expect(token).not.toContain('secret-share')
    expect(verifyFiscalDocumentToken(token, 'secret-share')).toEqual({ facturaId: 'FACT-1', tipo: 'RIDE' })
    vi.useRealTimers()
  })

  it('rechaza tokens alterados o expirados', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-31T12:00:00.000Z'))
    const token = createFiscalDocumentToken({ facturaId: 'FACT-1', tipo: 'XML_AUTORIZADO', expiresInSeconds: 1 }, 'secret-share')
    expect(() => verifyFiscalDocumentToken(`${token}x`, 'secret-share')).toThrow(/alterado|válido/)
    vi.setSystemTime(new Date('2026-08-31T12:00:03.000Z'))
    expect(() => verifyFiscalDocumentToken(token, 'secret-share')).toThrow(/expiró/)
    vi.useRealTimers()
  })
})
