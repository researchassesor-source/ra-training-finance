import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const { listarMock, consultarMock } = vi.hoisted(() => ({
  listarMock: vi.fn(),
  consultarMock: vi.fn(),
}))

vi.mock('../../lib/fiscal/orchestration/gasClient.js', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, callGasAction: listarMock }
})
vi.mock('../../lib/fiscal/orchestration/facturaOrchestrator.js', () => ({
  consultarYActualizarAutorizacion: consultarMock,
}))

const { default: handler } = await import('./poll.js')

function mockRes() {
  const res = { statusCode: null, body: null }
  res.status = code => { res.statusCode = code; return res }
  res.json = payload => { res.body = payload; return res }
  return res
}

const originalEnv = { ...process.env }

beforeEach(() => {
  listarMock.mockReset()
  consultarMock.mockReset()
  process.env.FISCAL_POLL_SECRET = 'secreto-poll-de-prueba'
})

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('POST /api/fiscal/poll', () => {
  it('rechaza sin el header del secreto', async () => {
    const res = mockRes()
    await handler({ method: 'POST', headers: {}, body: {} }, res)
    expect(res.statusCode).toBe(401)
    expect(listarMock).not.toHaveBeenCalled()
  })

  it('rechaza con un secreto incorrecto', async () => {
    const res = mockRes()
    await handler({ method: 'POST', headers: { 'x-fiscal-poll-secret': 'equivocado' }, body: {} }, res)
    expect(res.statusCode).toBe(401)
    expect(listarMock).not.toHaveBeenCalled()
  })

  it('rechaza si FISCAL_POLL_SECRET no está configurado en el entorno', async () => {
    delete process.env.FISCAL_POLL_SECRET
    const res = mockRes()
    await handler({ method: 'POST', headers: { 'x-fiscal-poll-secret': 'lo-que-sea' }, body: {} }, res)
    expect(res.statusCode).toBe(401)
  })

  it('el mensaje de error nunca incluye el valor del secreto', async () => {
    const res = mockRes()
    await handler({ method: 'POST', headers: { 'x-fiscal-poll-secret': 'equivocado' }, body: {} }, res)
    expect(JSON.stringify(res.body)).not.toContain('secreto-poll-de-prueba')
  })

  it('lote sin pendientes: responde éxito con 0 procesadas, sin llamar a consultarYActualizarAutorizacion', async () => {
    listarMock.mockResolvedValue([])
    const res = mockRes()
    await handler({ method: 'POST', headers: { 'x-fiscal-poll-secret': 'secreto-poll-de-prueba' }, body: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body.data.procesadas).toBe(0)
    expect(consultarMock).not.toHaveBeenCalled()
  })

  it('procesa un lote y agrega los resultados de cada factura', async () => {
    listarMock.mockResolvedValue([{ ID: 'FACT-1' }, { ID: 'FACT-2' }])
    consultarMock.mockResolvedValueOnce({ outcome: 'AUTHORIZED' }).mockResolvedValueOnce({ outcome: 'EN_PROCESO' })
    const res = mockRes()
    await handler({ method: 'POST', headers: { 'x-fiscal-poll-secret': 'secreto-poll-de-prueba' }, body: {} }, res)
    expect(res.body.data.procesadas).toBe(2)
    expect(res.body.data.resultados).toEqual([
      { facturaId: 'FACT-1', outcome: 'AUTHORIZED' },
      { facturaId: 'FACT-2', outcome: 'EN_PROCESO' },
    ])
  })

  it('tolera la caída del SRI en una factura sin tumbar el resto del lote', async () => {
    listarMock.mockResolvedValue([{ ID: 'FACT-1' }, { ID: 'FACT-2' }])
    consultarMock.mockRejectedValueOnce(new Error('SRI no disponible')).mockResolvedValueOnce({ outcome: 'AUTHORIZED' })
    const res = mockRes()
    await handler({ method: 'POST', headers: { 'x-fiscal-poll-secret': 'secreto-poll-de-prueba' }, body: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body.data.resultados[0].outcome).toBe('ERROR')
    expect(res.body.data.resultados[1].outcome).toBe('AUTHORIZED')
  })

  it('respeta un tamaño de lote máximo razonable aunque se pida uno mayor', async () => {
    listarMock.mockResolvedValue([])
    const res = mockRes()
    await handler({ method: 'POST', headers: { 'x-fiscal-poll-secret': 'secreto-poll-de-prueba' }, body: { limit: 99999 } }, res)
    expect(listarMock).toHaveBeenCalledWith('listarFacturasPendientesDePolling', expect.objectContaining({ limit: 50 }))
  })

  it('rechaza métodos distintos de POST', async () => {
    const res = mockRes()
    await handler({ method: 'GET', headers: {} }, res)
    expect(res.statusCode).toBe(405)
  })
})
