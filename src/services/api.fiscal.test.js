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
    expect(fetch.mock.calls[1][0]).toBe('/api/fiscal/from-inscripcion')
    expect(fiscalBody).toMatchObject({ inscripcionId: 'INS-1' })
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

/**
 * Regresión de seguridad: fiscalFetch metía el token de sesión en la query string aun
 * en POST (`if (token) query.set('token', token)` incondicional), filtrándolo a los
 * Vercel Logs y al historial del navegador -- causa confirmada del hallazgo de
 * seguridad reportado junto con el HTTP 502 de /api/fiscal/process. Ahora el token
 * viaja EXCLUSIVAMENTE por `Authorization: Bearer` y nunca aparece en ninguna URL.
 */
describe('fiscalFetch — el token de sesión nunca viaja en la URL (regresión de seguridad)', () => {
  beforeEach(() => {
    localStorage.setItem('rat_token', 'admin-token-secreto-9x7')
    global.fetch = vi.fn()
  })

  it('1. POST /api/fiscal/process: la URL no contiene el token en ningún punto', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ success: true, data: {} }))
    await api.procesarFacturaFiscal('FACT-1')

    const url = fetch.mock.calls[0][0]
    expect(url).toBe('/api/fiscal/process')
    expect(url).not.toContain('token')
    expect(url).not.toContain('admin-token-secreto-9x7')
  })

  it('2. POST /api/fiscal/process: el token llega correctamente por Authorization: Bearer, y el body solo lleva los datos propios de la acción', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ success: true, data: {} }))
    await api.procesarFacturaFiscal('FACT-1')

    const [, init] = fetch.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer admin-token-secreto-9x7')
    expect(JSON.parse(init.body)).toEqual({ facturaId: 'FACT-1' })
  })

  it('3. GET /api/fiscal/list: la URL no contiene el token', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ success: true, data: { items: [] } }))
    await api.getFacturasFiscales({ environment: 'production' })

    const url = fetch.mock.calls[0][0]
    expect(url).not.toContain('token')
    expect(url).not.toContain('admin-token-secreto-9x7')
    // Otros filtros sí pueden ir en la query string -- solo el token está prohibido ahí.
    expect(url).toContain('environment=production')
  })

  it('4. Descargas fiscales (GET /api/fiscal/document): la URL no contiene el token', async () => {
    fetch.mockResolvedValueOnce(new Response(new Blob(['xml']), {
      status: 200,
      headers: { 'Content-Disposition': 'attachment; filename="factura.xml"' },
    }))
    await api.descargarDocumentoFiscal('FACT-1', 'XML_AUTORIZADO')

    const url = fetch.mock.calls[0][0]
    expect(url).not.toContain('token')
    expect(url).not.toContain('admin-token-secreto-9x7')
  })

  it('5. GET /api/fiscal/status: Authorization Bearer se envía correctamente y la URL no lleva el token', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ success: true, data: {} }))
    await api.getFacturaFiscalStatus('FACT-1')

    const [url, init] = fetch.mock.calls[0]
    expect(url).not.toContain('token')
    expect(init.headers.Authorization).toBe('Bearer admin-token-secreto-9x7')
  })

  it('6. sin sesión activa, fiscalFetch no agrega ningún header Authorization (nada que filtrar)', async () => {
    localStorage.removeItem('rat_token')
    fetch.mockResolvedValueOnce(jsonResponse({ success: true, data: { items: [] } }))
    await api.getFacturasFiscales({})

    const [, init] = fetch.mock.calls[0]
    expect(init.headers.Authorization).toBeUndefined()
  })

  it('7. fiscalFetch nunca vuelve a llamar query.set("token", ...): ninguna llamada fiscal genera jamás ?token= en la URL', async () => {
    fetch
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { items: [] } }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: {} }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: {} }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: {} }))

    await api.getFacturasFiscales({ environment: 'test' })
    await api.getFacturaFiscalStatus('FACT-1')
    await api.procesarFacturaFiscal('FACT-1')
    await api.cerrarEntregaFiscal('FACT-1')

    for (const call of fetch.mock.calls) {
      expect(call[0]).not.toMatch(/[?&]token=/)
    }
  })

  it('8. la sesión existente sigue funcionando de punta a punta con el nuevo transporte (Authorization Bearer)', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ success: true, data: { items: [{ id: 'FACT-1' }], summary: {} } }))
    const result = await api.getFacturasFiscales({ environment: 'production' })
    expect(result.data.items).toHaveLength(1)
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer admin-token-secreto-9x7')
  })
})
