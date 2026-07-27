import { describe, expect, it } from 'vitest'
import { buildVerificationUrl, generateQrDataUrl } from './qr'

describe('QR de verificación', () => {
  it('genera una URL pública por identificador sin exponer datos financieros', () => {
    const url = buildVerificationUrl('INS DEMO/01')
    expect(url).toContain('/verificar/INS%20DEMO%2F01')
    expect(url).not.toMatch(/monto|pago|ruc|telefono/i)
  })

  it('genera códigos distintos para inscripciones distintas', async () => {
    const first = await generateQrDataUrl('INS-DEMO-001')
    const second = await generateQrDataUrl('INS-DEMO-002')
    expect(first).toMatch(/^data:image\/png;base64,/)
    expect(second).toMatch(/^data:image\/png;base64,/)
    expect(first).not.toBe(second)
  })
})
