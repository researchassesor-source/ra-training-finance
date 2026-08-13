import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('api fiscal', () => {
  beforeEach(() => {
    localStorage.setItem('rat_token', 'admin-token')
    global.fetch = vi.fn()
  })

  it('al verificar un pago crea factura fiscal una sola vez con la inscripción', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { ID: 'INS-1' } }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { factura: { id: 'FACT-1' } } }))

    const result = await api.verificarPagoInscripcion('INS-1')

    expect(result.fiscal.data.factura.id).toBe('FACT-1')
    expect(fetch).toHaveBeenCalledTimes(2)
    const fiscalBody = JSON.parse(fetch.mock.calls[1][1].body)
    expect(fetch.mock.calls[1][0]).toContain('/api/fiscal/from-inscripcion?')
    expect(fiscalBody).toMatchObject({ token: 'admin-token', inscripcionId: 'INS-1' })
  })

  it('si la factura falla después del pago no rompe la confirmación de pago', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { ID: 'INS-1' } }))
      .mockResolvedValueOnce(jsonResponse({ success: false, error: 'Falta cédula/RUC válido del cliente para facturar.' }, { status: 422 }))

    const result = await api.verificarPagoInscripcion('INS-1')

    expect(result.success).toBe(true)
    expect(result.fiscalWarning).toContain('Falta cédula')
  })

  it('descarga XML/RIDE como blob sin exponer el token en el cuerpo', async () => {
    fetch.mockResolvedValueOnce(new Response(new Blob(['xml'], { type: 'application/xml' }), {
      status: 200,
      headers: { 'Content-Disposition': 'attachment; filename="factura.xml"' },
    }))

    const result = await api.descargarDocumentoFiscal('FACT-1', 'XML_AUTORIZADO')

    expect(result.filename).toBe('factura.xml')
    expect(fetch.mock.calls[0][0]).toContain('/api/fiscal/document?')
    expect(fetch.mock.calls[0][1].body).toBeUndefined()
  })
})
