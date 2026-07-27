import { describe, expect, it } from 'vitest'
import jsQR from 'jsqr'
import { PNG } from 'pngjs'
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

  it('puede decodificarse después de generarlo', async () => {
    const dataUrl = await generateQrDataUrl('INS-DEMO-SCAN')
    const png = PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64'))
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)
    expect(decoded?.data).toContain('/verificar/INS-DEMO-SCAN')
  })
})
