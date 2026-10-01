import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { callGasActionAsUserMock } = vi.hoisted(() => ({ callGasActionAsUserMock: vi.fn() }))
vi.mock('../../../lib/fiscal/orchestration/gasClient.js', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, callGasActionAsUser: callGasActionAsUserMock }
})

const [{ default: handler }, { GasClientError }] = await Promise.all([
  import('../../../api/fiscal/document.js'),
  import('../../../lib/fiscal/orchestration/gasClient.js'),
])

function mockReq(query = {}, headers = { authorization: 'Bearer token-test' }) {
  return { method: 'GET', query, headers }
}

function mockRes() {
  const res = { statusCode: null, body: null, headers: {} }
  res.setHeader = (name, value) => { res.headers[name] = value; return res }
  res.status = code => { res.statusCode = code; return res }
  res.json = payload => { res.body = payload; return res }
  res.send = payload => { res.body = payload; return res }
  return res
}

beforeEach(() => callGasActionAsUserMock.mockReset())
afterEach(() => vi.restoreAllMocks())

describe('GET /api/fiscal/document — descarga privada', () => {
  it('sirve bytes de la factura con headers de tipo, nombre y no-cache privada', async () => {
    callGasActionAsUserMock.mockResolvedValue({
      contentBase64: Buffer.from('%PDF-1.4 demo').toString('base64'),
      filename: 'RIDE_001-002.pdf', mimeType: 'application/pdf', sha256: 'abc123',
    })
    const res = mockRes()
    await handler(mockReq({ facturaId: 'FACT-1' }), res)

    expect(res.statusCode).toBe(200)
    expect(res.headers['Content-Type']).toBe('application/pdf')
    expect(res.headers['Content-Disposition']).toContain('RIDE_001-002.pdf')
    expect(res.headers['Cache-Control']).toBe('private, no-store')
    expect(res.headers.Vary).toBe('Authorization')
    expect(res.body.toString()).toBe('%PDF-1.4 demo')
  })

  it('distingue sesión expirada, permiso insuficiente, factura ausente y fallo del backend', async () => {
    const cases = [
      ['SESSION_INVALID', 401],
      ['FORBIDDEN', 403],
      ['NOT_FOUND', 404],
      ['UPSTREAM_ERROR', 502],
    ]
    for (const [code, expectedStatus] of cases) {
      callGasActionAsUserMock.mockRejectedValueOnce(new GasClientError('fallo simulado', { code }))
      const res = mockRes()
      await handler(mockReq({ facturaId: 'FACT-1' }), res)
      expect(res.statusCode).toBe(expectedStatus)
      expect(res.headers['Cache-Control']).toBe('private, no-store')
    }
  })

  it('responde 401 si no hay token y 400 si falta la factura', async () => {
    const noToken = mockRes()
    await handler(mockReq({ facturaId: 'FACT-1' }, {}), noToken)
    expect(noToken.statusCode).toBe(401)

    const noFactura = mockRes()
    await handler(mockReq({}, { authorization: 'Bearer token-test' }), noFactura)
    expect(noFactura.statusCode).toBe(400)
  })
})
