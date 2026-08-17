import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { callGasActionAsUserMock } = vi.hoisted(() => ({ callGasActionAsUserMock: vi.fn() }))
vi.mock('../../lib/fiscal/orchestration/gasClient.js', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, callGasActionAsUser: callGasActionAsUserMock }
})

const { default: handler } = await import('./list.js')

function mockReq(query, headers = { authorization: 'Bearer tok' }) {
  return { method: 'GET', query, headers }
}
function mockRes() {
  const res = { statusCode: null, body: null }
  res.status = code => { res.statusCode = code; return res }
  res.json = payload => { res.body = payload; return res }
  return res
}

const FACTURA_ROW = {
  ID: 'FACT-1', Environment: 'production', Status: 'DELIVERY_PENDING', InscripcionID: 'INS-1',
  DocumentNumber: '001-002-000000001', BuyerName: 'Cliente Demo', GrandTotal: 2000,
}
const INSCRIPCION_ROW = {
  ID: 'INS-1', ServicioNombre: 'Curso Demo', NumeroComprobante: 'TRX-998877', FechaPago: '2026-08-01', MetodoPago: 'Transferencia',
}

function installGasRouter({ inscripcionesThrows = false } = {}) {
  callGasActionAsUserMock.mockImplementation(async (action, params) => {
    if (action === 'getFacturasFiscales') return [FACTURA_ROW]
    if (action === 'getFacturaFiscalCompleta') return { factura: FACTURA_ROW, items: [] }
    if (action === 'getInscripciones') {
      if (inscripcionesThrows) throw new Error('boom')
      return [INSCRIPCION_ROW]
    }
    throw new Error('acción GAS no mockeada en el test: ' + action)
  })
}

beforeEach(() => {
  callGasActionAsUserMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /api/fiscal/list — trazabilidad de origen (solo lectura)', () => {
  it('adjunta originInscripcion (comprobante/curso/fecha de pago) cuando InscripcionID tiene match real por ID', async () => {
    installGasRouter()
    const res = mockRes()
    await handler(mockReq({ environment: 'production' }), res)

    expect(res.statusCode).toBe(200)
    const item = res.body.data.items[0]
    expect(item.inscripcionId).toBe('INS-1')
    expect(item.originInscripcion).toEqual({
      id: 'INS-1', servicioNombre: 'Curso Demo', numeroComprobante: 'TRX-998877', fechaPago: '2026-08-01', metodoPago: 'Transferencia',
    })
  })

  it('degrada a originInscripcion=null (nunca inventa datos) si getInscripciones falla', async () => {
    installGasRouter({ inscripcionesThrows: true })
    const res = mockRes()
    await handler(mockReq({ environment: 'production' }), res)

    expect(res.statusCode).toBe(200)
    expect(res.body.data.items[0].originInscripcion).toBeNull()
    expect(res.body.data.items[0].id).toBe('FACT-1') // el listado de facturas sigue funcionando
  })

  it('degrada a originInscripcion=null para facturas legacy sin InscripcionID (nunca infiere por nombre/monto)', async () => {
    callGasActionAsUserMock.mockImplementation(async action => {
      if (action === 'getFacturasFiscales') return [{ ...FACTURA_ROW, InscripcionID: '' }]
      if (action === 'getFacturaFiscalCompleta') return { factura: { ...FACTURA_ROW, InscripcionID: '' }, items: [] }
      if (action === 'getInscripciones') return [INSCRIPCION_ROW]
      throw new Error('acción no mockeada: ' + action)
    })
    const res = mockRes()
    await handler(mockReq({ environment: 'production' }), res)

    expect(res.body.data.items[0].inscripcionId).toBe('')
    expect(res.body.data.items[0].originInscripcion).toBeNull()
  })

  it('la búsqueda (q) encuentra la factura por número de comprobante de la inscripción de origen', async () => {
    installGasRouter()
    const res = mockRes()
    await handler(mockReq({ environment: 'production', q: 'TRX-998877' }), res)

    expect(res.body.data.items).toHaveLength(1)
    expect(res.body.data.items[0].id).toBe('FACT-1')
  })

  it('NUNCA llama acciones que crean/mutan facturas o reservan secuenciales -- solo lecturas', async () => {
    installGasRouter()
    const res = mockRes()
    await handler(mockReq({ environment: 'production' }), res)

    const calledActions = callGasActionAsUserMock.mock.calls.map(call => call[0])
    expect(calledActions).toEqual(expect.arrayContaining(['getFacturasFiscales', 'getFacturaFiscalCompleta', 'getInscripciones']))
    const forbidden = ['crearBorradorFactura', 'reservarSecuencialFiscal', 'transicionEstadoFactura', 'verificarPagoInscripcion']
    for (const action of forbidden) expect(calledActions).not.toContain(action)
  })
})
