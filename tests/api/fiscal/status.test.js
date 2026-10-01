import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { callGasActionAsUserMock } = vi.hoisted(() => ({ callGasActionAsUserMock: vi.fn() }))
vi.mock('../../../lib/fiscal/orchestration/gasClient.js', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, callGasActionAsUser: callGasActionAsUserMock }
})

const [{ default: handler }, { GasClientError }] = await Promise.all([
  import('../../../api/fiscal/status.js'),
  import('../../../lib/fiscal/orchestration/gasClient.js'),
])

function mockReq(query = {}, headers = { authorization: 'Bearer token-test' }) { return { method: 'GET', query, headers } }
function mockRes() {
  const res = { statusCode: null, body: null, headers: {} }
  res.setHeader = (name, value) => { res.headers[name] = value; return res }
  res.status = code => { res.statusCode = code; return res }
  res.json = payload => { res.body = payload; return res }
  return res
}

beforeEach(() => callGasActionAsUserMock.mockReset())
afterEach(() => vi.restoreAllMocks())

describe('GET /api/fiscal/status — sesión, permisos y disponibilidad', () => {
  it('no almacena en caché datos de factura y devuelve el estado consultado', async () => {
    callGasActionAsUserMock.mockResolvedValue({ factura: { ID: 'FACT-1', Status: 'AUTHORIZED' }, items: [] })
    const res = mockRes()
    await handler(mockReq({ facturaId: 'FACT-1' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.headers['Cache-Control']).toBe('private, no-store')
    expect(res.headers.Vary).toBe('Authorization')
  })

  it.each([
    ['SESSION_INVALID', 401], ['FORBIDDEN', 403], ['NOT_FOUND', 404], ['UPSTREAM_ERROR', 502],
  ])('mapea %s a HTTP %i', async (code, status) => {
    callGasActionAsUserMock.mockRejectedValue(new GasClientError('rechazo simulado', { code }))
    const res = mockRes()
    await handler(mockReq({ facturaId: 'FACT-1' }), res)
    expect(res.statusCode).toBe(status)
  })

  it('responde 401 sin token y 400 si falta facturaId', async () => {
    const noToken = mockRes()
    await handler(mockReq({ facturaId: 'FACT-1' }, {}), noToken)
    expect(noToken.statusCode).toBe(401)
    const noId = mockRes()
    await handler(mockReq({}, { authorization: 'Bearer token-test' }), noId)
    expect(noId.statusCode).toBe(400)
  })
})
