import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { callGasActionAsUserMock, continuarFlujoFacturaMock, loadSigningKeysMock } = vi.hoisted(() => ({
  callGasActionAsUserMock: vi.fn(),
  continuarFlujoFacturaMock: vi.fn(),
  loadSigningKeysMock: vi.fn(),
}))

vi.mock('../../lib/fiscal/orchestration/gasClient.js', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, callGasActionAsUser: callGasActionAsUserMock }
})
vi.mock('../../lib/fiscal/orchestration/facturaOrchestrator.js', () => ({
  continuarFlujoFactura: continuarFlujoFacturaMock,
}))
vi.mock('../../lib/fiscal/orchestration/loadSigningKeys.js', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, loadSigningKeysFromEnv: loadSigningKeysMock }
})

const { default: handler } = await import('./process.js')
const { GasClientError } = await import('../../lib/fiscal/orchestration/gasClient.js')
const { XadesSignError, XadesVerifyError } = await import('../../lib/fiscal/xadesSign.js')

function mockRes() {
  const res = { statusCode: null, body: null }
  res.status = code => { res.statusCode = code; return res }
  res.json = payload => { res.body = payload; return res }
  return res
}

beforeEach(() => {
  callGasActionAsUserMock.mockReset()
  continuarFlujoFacturaMock.mockReset()
  loadSigningKeysMock.mockReset()
  callGasActionAsUserMock.mockResolvedValue({ factura: { ID: 'FACT-1', Status: 'GENERATED' } })
  loadSigningKeysMock.mockReturnValue({ privateKeyPem: 'pem', certificatePem: 'pem', certificateBase64: 'b64', certificate: {} })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/fiscal/process — autenticación del token (Authorization Bearer / body / query)', () => {
  it('acepta el token por Authorization: Bearer (transporte preferido del frontend corregido)', async () => {
    continuarFlujoFacturaMock.mockResolvedValue({ outcome: 'RECEIVED' })
    const res = mockRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer tok-header' }, body: { facturaId: 'FACT-1' } }, res)

    expect(res.statusCode).toBe(200)
    expect(callGasActionAsUserMock.mock.calls[0][2]).toBe('tok-header')
  })

  it('sigue aceptando el token en el body (compatibilidad hacia atrás)', async () => {
    continuarFlujoFacturaMock.mockResolvedValue({ outcome: 'RECEIVED' })
    const res = mockRes()
    await handler({ method: 'POST', headers: {}, body: { token: 'tok-body', facturaId: 'FACT-1' } }, res)

    expect(res.statusCode).toBe(200)
    expect(callGasActionAsUserMock.mock.calls[0][2]).toBe('tok-body')
  })

  it('sin token en ninguna fuente, responde 400 sin llegar a llamar a Apps Script', async () => {
    const res = mockRes()
    await handler({ method: 'POST', headers: {}, body: { facturaId: 'FACT-1' } }, res)

    expect(res.statusCode).toBe(400)
    expect(callGasActionAsUserMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/fiscal/process — manejo de errores sanitizado (hotfix HTTP 502 genérico)', () => {
  it('un fallo de firma XAdES (XadesSignError) responde 500 con code=FISCAL_SIGNING_FAILED y un mensaje seguro, no el genérico anterior', async () => {
    continuarFlujoFacturaMock.mockRejectedValue(new XadesSignError('No se pudo canonicalizar el fragmento XML (C14N): boom'))
    const res = mockRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer tok' }, body: { facturaId: 'FACT-1' } }, res)

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({
      success: false,
      code: 'FISCAL_SIGNING_FAILED',
      error: 'No se pudo generar la firma electrónica del comprobante.',
    })
  })

  it('un fallo de verificación de firma (XadesVerifyError) también se clasifica como FISCAL_SIGNING_FAILED', async () => {
    continuarFlujoFacturaMock.mockRejectedValue(new XadesVerifyError('firma inválida'))
    const res = mockRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer tok' }, body: { facturaId: 'FACT-1' } }, res)

    expect(res.statusCode).toBe(500)
    expect(res.body.code).toBe('FISCAL_SIGNING_FAILED')
  })

  it('un GasClientError conserva su mensaje original (no se sanitiza como firma) y responde 502', async () => {
    continuarFlujoFacturaMock.mockRejectedValue(new GasClientError('Apps Script rechazó la acción "transicionEstadoFactura": conflicto de estado'))
    const res = mockRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer tok' }, body: { facturaId: 'FACT-1' } }, res)

    expect(res.statusCode).toBe(502)
    expect(res.body).toEqual({ success: false, error: 'Apps Script rechazó la acción "transicionEstadoFactura": conflicto de estado' })
  })

  it('cualquier otro error no clasificado sigue devolviendo el mensaje genérico anterior (no revela detalles internos)', async () => {
    continuarFlujoFacturaMock.mockRejectedValue(new TypeError('Cannot read properties of undefined'))
    const res = mockRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer tok' }, body: { facturaId: 'FACT-1' } }, res)

    expect(res.statusCode).toBe(502)
    expect(res.body).toEqual({ success: false, error: 'No se pudo procesar la factura.' })
  })

  it('ningún log de servidor imprime el mensaje del error, secretos, ni el body/token -- solo name/code', async () => {
    const secretoSensible = 'PRIVATE-KEY-BEGIN...password=super-secreta...FISCAL_SERVICE_TOKEN=xyz...token-sesion-abc'
    continuarFlujoFacturaMock.mockRejectedValue(new XadesSignError(secretoSensible))
    const res = mockRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer tok-secreto-no-debe-salir' }, body: { facturaId: 'FACT-1' } }, res)

    expect(console.error).toHaveBeenCalled()
    const loggedArgs = console.error.mock.calls.flat().map(arg => JSON.stringify(arg))
    const loggedText = loggedArgs.join(' ')
    expect(loggedText).not.toContain(secretoSensible)
    expect(loggedText).not.toContain('password')
    expect(loggedText).not.toContain('PRIVATE-KEY')
    expect(loggedText).not.toContain('tok-secreto-no-debe-salir')
  })
})
