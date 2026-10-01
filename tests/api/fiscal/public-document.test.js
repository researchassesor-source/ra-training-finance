import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { callGasActionMock } = vi.hoisted(() => ({ callGasActionMock: vi.fn() }))
vi.mock('../../../lib/fiscal/orchestration/gasClient.js', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, callGasAction: callGasActionMock }
})

const { default: handler } = await import('../../../api/fiscal/public-document.js')
const { createFiscalDocumentToken } = await import('../../../lib/fiscal/shareToken.js')

function mockReq(token) { return { method: 'GET', query: { token }, headers: {} } }
function mockRes() {
  const res = { statusCode: null, body: null, headers: {} }
  res.setHeader = (name, value) => { res.headers[name] = value; return res }
  res.status = code => { res.statusCode = code; return res }
  res.json = payload => { res.body = payload; return res }
  res.send = payload => { res.body = payload; return res }
  return res
}

beforeEach(() => {
  callGasActionMock.mockReset()
  vi.stubEnv('FISCAL_DOCUMENT_SHARE_SECRET', 'test-share-secret')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('GET /api/fiscal/public-document — link firmado de cliente', () => {
  it('rechaza enlaces alterados con 403 y no llama a Apps Script', async () => {
    const res = mockRes()
    await handler(mockReq('not-a-signed-token'), res)
    expect(res.statusCode).toBe(403)
    expect(res.headers['Cache-Control']).toBe('private, no-store')
    expect(callGasActionMock).not.toHaveBeenCalled()
  })

  it('devuelve 502 (no 403 engañoso) si el enlace es válido y falla el almacenamiento fiscal', async () => {
    const token = createFiscalDocumentToken({ facturaId: 'FACT-1', tipo: 'RIDE' }, 'test-share-secret')
    callGasActionMock.mockRejectedValue(new Error('storage indisponible'))
    const res = mockRes()
    await handler(mockReq(token), res)
    expect(res.statusCode).toBe(502)
    expect(res.body.error).toMatch(/no se pudo obtener/i)
    expect(res.headers['Cache-Control']).toBe('private, no-store')
  })
})
