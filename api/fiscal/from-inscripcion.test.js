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

const { default: handler, resolverClasificacionFiscalCurso } = await import('./from-inscripcion.js')
const { SigningKeysNotConfiguredError } = await import('../../lib/fiscal/orchestration/loadSigningKeys.js')

function mockRes() {
  const res = { statusCode: null, body: null }
  res.status = code => { res.statusCode = code; return res }
  res.json = payload => { res.body = payload; return res }
  return res
}

// RequiereAvalExterno: false por defecto -- inequívoco, para que los tests
// preexistentes (que no ejercitan la clasificación fiscal) sigan pasando el flujo
// normalmente. Los tests de clasificación fiscal sobreescriben este campo a propósito.
function validInscripcion(overrides = {}) {
  return {
    ID: 'INS-1', ClienteID: '0102030405', ClienteNombre: 'Cliente Válido',
    EstadoPago: 'verificado', Monto: 20, ServicioNombre: 'Curso Demo',
    ClienteEmail: 'cliente@example.test', MetodoPago: 'Transferencia',
    RequiereAvalExterno: false,
    ...overrides,
  }
}

const originalEnv = { ...process.env }

/** Rutea cada acción GAS mockeada a su fixture -- las fixtures son reasignables por
 * test. `facturasPorEnvironment` simula que GAS filtra getFacturasFiscales por el
 * `environment` recibido en params (igual que el índice real). */
let facturasPorEnvironment
let inscripcionesFixture
let conflictoFixture
let draftFixture
let facturaCompletaFixture

function installGasRouter() {
  callGasActionAsUserMock.mockImplementation(async (action, params) => {
    if (action === 'getFacturasFiscales') return facturasPorEnvironment[params.environment] || []
    if (action === 'getInscripciones') return inscripcionesFixture
    if (action === 'verificarConflictoSerieFiscal') return conflictoFixture
    if (action === 'crearBorradorFactura') return draftFixture
    if (action === 'reservarSecuencialFiscal') return {}
    if (action === 'getFacturaFiscalCompleta') return { factura: facturaCompletaFixture }
    throw new Error('acción GAS no mockeada en el test: ' + action)
  })
}

beforeEach(() => {
  process.env = { ...originalEnv }
  callGasActionAsUserMock.mockReset()
  continuarFlujoFacturaMock.mockReset()
  loadSigningKeysMock.mockReset()
  facturasPorEnvironment = { test: [], production: [] }
  inscripcionesFixture = [validInscripcion()]
  conflictoFixture = { facturasEncontradas: 0, contadoresEncontrados: 0 }
  draftFixture = { ID: 'FACT-1', Status: 'DRAFT' }
  facturaCompletaFixture = { ID: 'FACT-1', Status: 'DRAFT', InscripcionID: 'INS-1', Environment: 'production' }
  loadSigningKeysMock.mockImplementation(() => { throw new SigningKeysNotConfiguredError('sin certificado configurado en este entorno de prueba') })
  installGasRouter()
})

afterEach(() => {
  process.env = { ...originalEnv }
})

function callsFor(action) {
  return callGasActionAsUserMock.mock.calls.filter(call => call[0] === action)
}

describe('POST /api/fiscal/from-inscripcion — guard de entorno Production (hotfix)', () => {
  it('1. Production sin SRI_ENVIRONMENT=production (ausente) -> bloquea antes del DRAFT, 0 llamadas GAS', async () => {
    process.env.VERCEL_ENV = 'production'
    delete process.env.SRI_ENVIRONMENT
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-1' } }, res)

    expect(res.statusCode).toBe(500)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toMatch(/SRI_ENVIRONMENT no está configurado explícitamente como production/)
    expect(callGasActionAsUserMock).not.toHaveBeenCalled()
    expect(callsFor('crearBorradorFactura')).toHaveLength(0)
    expect(callsFor('reservarSecuencialFiscal')).toHaveLength(0)
  })

  it('2. Production con SRI_ENVIRONMENT=test -> bloquea igual, 0 mutaciones fiscales', async () => {
    process.env.VERCEL_ENV = 'production'
    process.env.SRI_ENVIRONMENT = 'test'
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-1' } }, res)

    expect(res.statusCode).toBe(500)
    expect(res.body.success).toBe(false)
    expect(callGasActionAsUserMock).not.toHaveBeenCalled()
    expect(callsFor('crearBorradorFactura')).toHaveLength(0)
    expect(callsFor('reservarSecuencialFiscal')).toHaveLength(0)
  })

  it('3. Production con SRI_ENVIRONMENT=production -> el guard NO bloquea, el flujo continúa', async () => {
    process.env.VERCEL_ENV = 'production'
    process.env.SRI_ENVIRONMENT = 'production'
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-1' } }, res)

    expect(callsFor('crearBorradorFactura')).toHaveLength(1)
    expect(callsFor('crearBorradorFactura')[0][1]).toMatchObject({ environment: 'production' })
    // Sin llaves de firma configuradas (fixture por defecto): éxito con atención, no un bloqueo.
    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.attention).toMatch(/certificado de firma pendiente/)
  })

  it('4. Preview/desarrollo (VERCEL_ENV != production) sin SRI_ENVIRONMENT -> sigue usando test, sin bloqueo', async () => {
    delete process.env.VERCEL_ENV
    delete process.env.SRI_ENVIRONMENT
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-1' } }, res)

    expect(callsFor('crearBorradorFactura')).toHaveLength(1)
    expect(callsFor('crearBorradorFactura')[0][1]).toMatchObject({ environment: 'test' })
  })
})

describe('POST /api/fiscal/from-inscripcion — aislamiento test/production e idempotencia', () => {
  it('8. un DRAFT test existente NO hace idempotente un intento production (InscripcionID + environment)', async () => {
    process.env.VERCEL_ENV = 'production'
    process.env.SRI_ENVIRONMENT = 'production'
    facturasPorEnvironment.test = [{ ID: 'FAC-ALEXANDER-TEST', InscripcionID: 'INS-1', Environment: 'test', Status: 'DRAFT' }]
    facturasPorEnvironment.production = []
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-1' } }, res)

    expect(res.body.data?.idempotent).not.toBe(true)
    expect(callsFor('crearBorradorFactura')).toHaveLength(1)
  })

  it('9. una factura production existente SÍ activa la idempotencia (0 llamadas a crearBorradorFactura)', async () => {
    process.env.VERCEL_ENV = 'production'
    process.env.SRI_ENVIRONMENT = 'production'
    facturasPorEnvironment.production = [{ ID: 'FAC-PROD-1', InscripcionID: 'INS-1', Environment: 'production', Status: 'AUTHORIZED', DocumentNumber: '001-002-000000005' }]
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-1' } }, res)

    expect(res.statusCode).toBe(200)
    expect(res.body.data).toMatchObject({ idempotent: true, factura: { id: 'FAC-PROD-1' } })
    expect(callsFor('crearBorradorFactura')).toHaveLength(0)
  })
})

describe('POST /api/fiscal/from-inscripcion — preflight de serie antes del DRAFT', () => {
  it('10/11/12. serie con facturas existentes y SIN contador -> bloquea antes del DRAFT (0 crearBorradorFactura, 0 reservarSecuencialFiscal)', async () => {
    conflictoFixture = { facturasEncontradas: 3, contadoresEncontrados: 0 }
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-1' } }, res)

    expect(res.statusCode).toBe(422)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toMatch(/tiene facturas existentes pero no existe un contador de secuencia en Finance/)
    expect(callsFor('crearBorradorFactura')).toHaveLength(0)
    expect(callsFor('reservarSecuencialFiscal')).toHaveLength(0)
  })

  it('13. serie consistente (facturas + contador, o ninguno) -> el flujo continúa normalmente', async () => {
    conflictoFixture = { facturasEncontradas: 5, contadoresEncontrados: 1 }
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-1' } }, res)

    expect(callsFor('crearBorradorFactura')).toHaveLength(1)
    expect(res.statusCode).toBe(200)
  })

  it('primer uso de la serie (sin facturas ni contador) no bloquea -- comportamiento seguro existente', async () => {
    conflictoFixture = { facturasEncontradas: 0, contadoresEncontrados: 0 }
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-1' } }, res)

    expect(callsFor('crearBorradorFactura')).toHaveLength(1)
  })

  it('el preflight nunca se ejecuta en el camino idempotente (no hay DRAFT nuevo que proteger)', async () => {
    facturasPorEnvironment.test = [{ ID: 'FAC-TEST-1', InscripcionID: 'INS-1', Environment: 'test', Status: 'DRAFT' }]
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-1' } }, res)

    expect(res.body.data?.idempotent).toBe(true)
    expect(callsFor('verificarConflictoSerieFiscal')).toHaveLength(0)
  })
})

function facturaRow(overrides = {}) {
  return {
    ID: 'FAC-OTHER', InscripcionID: 'INS-OTHER', Environment: 'production',
    Establishment: '001', EmissionPoint: '002', DocumentType: '01',
    Sequential: '', Status: 'AUTHORIZED',
    ...overrides,
  }
}

describe('POST /api/fiscal/from-inscripcion — consistencia de secuencia (LastSequential vs máximo persistido)', () => {
  // environment='production' explícito en todos estos tests: sin esto, getActiveEnvironment()
  // cae a 'test' (su fallback seguro) y las fixtures sembradas en facturasPorEnvironment.production
  // nunca se consultarían -- exactamente el aislamiento de ambientes que el hotfix anterior protege.
  beforeEach(() => {
    process.env.SRI_ENVIRONMENT = 'production'
  })

  it('1. max factura=1, contador=1 -> PASS', async () => {
    conflictoFixture = { facturasEncontradas: 1, contadoresEncontrados: 1, ultimoSecuencialEnFinance: 1 }
    facturasPorEnvironment.production = [facturaRow({ Sequential: '000000001' })]
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-1' } }, res)

    expect(callsFor('crearBorradorFactura')).toHaveLength(1)
    expect(res.statusCode).toBe(200)
  })

  it('2. max factura=5, contador=5 -> PASS', async () => {
    conflictoFixture = { facturasEncontradas: 5, contadoresEncontrados: 1, ultimoSecuencialEnFinance: 5 }
    facturasPorEnvironment.production = [
      facturaRow({ ID: 'F1', Sequential: '1' }),
      facturaRow({ ID: 'F2', Sequential: '000000005' }),
      facturaRow({ ID: 'F3', Sequential: '3' }),
    ]
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-1' } }, res)

    expect(callsFor('crearBorradorFactura')).toHaveLength(1)
    expect(res.statusCode).toBe(200)
  })

  it('3. max factura=5, contador=3 -> BLOQUEA antes del DRAFT', async () => {
    conflictoFixture = { facturasEncontradas: 5, contadoresEncontrados: 1, ultimoSecuencialEnFinance: 3 }
    facturasPorEnvironment.production = [facturaRow({ Sequential: '5' })]
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-1' } }, res)

    expect(res.statusCode).toBe(422)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toMatch(/secuencia fiscal de Finance está desactualizada respecto a las facturas existentes/)
    expect(callsFor('crearBorradorFactura')).toHaveLength(0)
    expect(callsFor('reservarSecuencialFiscal')).toHaveLength(0)
  })

  it('4. max factura=1, sin contador -> BLOQUEA antes del DRAFT (regla A, sin cambios)', async () => {
    conflictoFixture = { facturasEncontradas: 1, contadoresEncontrados: 0 }
    facturasPorEnvironment.production = [facturaRow({ Sequential: '1' })]
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-1' } }, res)

    expect(res.statusCode).toBe(422)
    expect(res.body.error).toMatch(/no existe un contador de secuencia en Finance/)
    expect(callsFor('crearBorradorFactura')).toHaveLength(0)
  })

  it('5. sin facturas, sin contador -> PASS (primer uso)', async () => {
    conflictoFixture = { facturasEncontradas: 0, contadoresEncontrados: 0 }
    facturasPorEnvironment.production = []
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-1' } }, res)

    expect(callsFor('crearBorradorFactura')).toHaveLength(1)
    // Primer uso: el máximo persistido nunca se consulta porque contadoresEncontrados === 0.
    expect(callsFor('getFacturasFiscales')).toHaveLength(1) // solo el de findExistingByInscripcion (idempotencia)
  })

  it('6. un DRAFT sin Sequential no aumenta el máximo persistido', async () => {
    conflictoFixture = { facturasEncontradas: 2, contadoresEncontrados: 1, ultimoSecuencialEnFinance: 1 }
    facturasPorEnvironment.production = [
      facturaRow({ ID: 'F1', Sequential: '1' }),
      facturaRow({ ID: 'F-DRAFT', Sequential: '', Status: 'DRAFT' }),
    ]
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-1' } }, res)

    expect(callsFor('crearBorradorFactura')).toHaveLength(1)
    expect(res.statusCode).toBe(200)
  })

  it('7. una factura test no participa en el cálculo del máximo production', async () => {
    conflictoFixture = { facturasEncontradas: 0, contadoresEncontrados: 1, ultimoSecuencialEnFinance: 0 }
    facturasPorEnvironment.production = []
    facturasPorEnvironment.test = [facturaRow({ Environment: 'test', Sequential: '99' })]
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-1' } }, res)

    expect(callsFor('crearBorradorFactura')).toHaveLength(1)
    expect(res.statusCode).toBe(200)
  })

  it('8. otra serie (EmissionPoint 003) no participa en el cálculo del máximo', async () => {
    conflictoFixture = { facturasEncontradas: 0, contadoresEncontrados: 1, ultimoSecuencialEnFinance: 0 }
    facturasPorEnvironment.production = [facturaRow({ EmissionPoint: '003', Sequential: '50' })]
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-1' } }, res)

    expect(callsFor('crearBorradorFactura')).toHaveLength(1)
    expect(res.statusCode).toBe(200)
  })

  it('9. otro DocumentType (ej. nota de crédito) no participa en el cálculo del máximo', async () => {
    conflictoFixture = { facturasEncontradas: 0, contadoresEncontrados: 1, ultimoSecuencialEnFinance: 0 }
    facturasPorEnvironment.production = [facturaRow({ DocumentType: '04', Sequential: '50' })]
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-1' } }, res)

    expect(callsFor('crearBorradorFactura')).toHaveLength(1)
    expect(res.statusCode).toBe(200)
  })

  it('10. una factura production existente de la MISMA InscripcionID sigue siendo idempotente; el preflight de secuencia nunca corre', async () => {
    conflictoFixture = { facturasEncontradas: 5, contadoresEncontrados: 1, ultimoSecuencialEnFinance: 3 } // inconsistente a propósito
    facturasPorEnvironment.production = [{ ID: 'FAC-PROD-1', InscripcionID: 'INS-1', Environment: 'production', Status: 'AUTHORIZED', DocumentNumber: '001-002-000000005' }]
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-1' } }, res)

    expect(res.body.data).toMatchObject({ idempotent: true })
    expect(callsFor('verificarConflictoSerieFiscal')).toHaveLength(0)
    expect(callsFor('crearBorradorFactura')).toHaveLength(0)
  })

  it('11/12. la inconsistencia de secuencia nunca deja pasar crearBorradorFactura ni reservarSecuencialFiscal', async () => {
    conflictoFixture = { facturasEncontradas: 5, contadoresEncontrados: 1, ultimoSecuencialEnFinance: 3 }
    facturasPorEnvironment.production = [facturaRow({ Sequential: '5' })]
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-1' } }, res)

    expect(callsFor('crearBorradorFactura')).toHaveLength(0)
    expect(callsFor('reservarSecuencialFiscal')).toHaveLength(0)
  })

  it('D. contador POR ENCIMA del máximo persistido no se bloquea ni se corrige (números reservados para facturas aún no terminales)', async () => {
    conflictoFixture = { facturasEncontradas: 1, contadoresEncontrados: 1, ultimoSecuencialEnFinance: 7 }
    facturasPorEnvironment.production = [facturaRow({ Sequential: '5' })]
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-1' } }, res)

    expect(callsFor('crearBorradorFactura')).toHaveLength(1)
    expect(res.statusCode).toBe(200)
  })

  it('nunca escribe SecuenciaFiscal ni reserva nada: solo detecta y bloquea (0 llamadas a reservarSecuencialFiscal en el caso inconsistente)', async () => {
    conflictoFixture = { facturasEncontradas: 5, contadoresEncontrados: 1, ultimoSecuencialEnFinance: 3 }
    facturasPorEnvironment.production = [facturaRow({ Sequential: '5' })]
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-1' } }, res)

    expect(callGasActionAsUserMock.mock.calls.some(call => call[0] === 'reservarSecuencialFiscal')).toBe(false)
    expect(callGasActionAsUserMock.mock.calls.some(call => call[0] === 'transicionEstadoFactura')).toBe(false)
  })
})

describe('resolverClasificacionFiscalCurso — código/descripción por aval (unitario)', () => {
  it('1/2/3. RequiereAvalExterno=false -> CAPACITACION_RA, descripción sin ITSAL, IVA 0% (SriTaxCode se define en el catálogo, no aquí)', () => {
    const r = resolverClasificacionFiscalCurso({ RequiereAvalExterno: false })
    expect(r.codigo).toBe('CAPACITACION_RA')
    expect(r.descripcionSufijo).not.toMatch(/ITSAL/)
    expect(r.descripcionSufijo).toBe('Curso R.A. Training')
  })

  it('4/5/6. RequiereAvalExterno=true -> CAPACITACION, descripción con ITSAL', () => {
    const r = resolverClasificacionFiscalCurso({ RequiereAvalExterno: true })
    expect(r.codigo).toBe('CAPACITACION')
    expect(r.descripcionSufijo).toMatch(/ITSAL/)
  })

  it('7. Monto=20 + RequiereAvalExterno=false -> sigue SIN aval (el monto nunca decide)', () => {
    const r = resolverClasificacionFiscalCurso({ RequiereAvalExterno: false, Monto: 20 })
    expect(r.codigo).toBe('CAPACITACION_RA')
  })

  it('8. Monto=10 + RequiereAvalExterno=true -> sigue CON aval (el monto nunca decide)', () => {
    const r = resolverClasificacionFiscalCurso({ RequiereAvalExterno: true, Monto: 10 })
    expect(r.codigo).toBe('CAPACITACION')
  })

  it('9. EstadoAval no altera la clasificación (RequiereAvalExterno=true + EstadoAval=pendiente sigue siendo con aval)', () => {
    const conPendiente = resolverClasificacionFiscalCurso({ RequiereAvalExterno: true, EstadoAval: 'pendiente' })
    const conAvalado = resolverClasificacionFiscalCurso({ RequiereAvalExterno: true, EstadoAval: 'avalado' })
    const sinAval = resolverClasificacionFiscalCurso({ RequiereAvalExterno: false, EstadoAval: '' })
    expect(conPendiente.codigo).toBe('CAPACITACION')
    expect(conAvalado.codigo).toBe('CAPACITACION')
    expect(sinAval.codigo).toBe('CAPACITACION_RA')
  })

  it('10. RequiereAvalExterno booleano false funciona', () => {
    expect(resolverClasificacionFiscalCurso({ RequiereAvalExterno: false }).codigo).toBe('CAPACITACION_RA')
  })

  it('11. RequiereAvalExterno="FALSE" (string de Sheets) funciona', () => {
    expect(resolverClasificacionFiscalCurso({ RequiereAvalExterno: 'FALSE' }).codigo).toBe('CAPACITACION_RA')
  })

  it('12. RequiereAvalExterno booleano true funciona', () => {
    expect(resolverClasificacionFiscalCurso({ RequiereAvalExterno: true }).codigo).toBe('CAPACITACION')
  })

  it('13. RequiereAvalExterno="TRUE" (string de Sheets) funciona', () => {
    expect(resolverClasificacionFiscalCurso({ RequiereAvalExterno: 'TRUE' }).codigo).toBe('CAPACITACION')
  })

  it('14. RequiereAvalExterno=0 / "0" funciona (sin aval)', () => {
    expect(resolverClasificacionFiscalCurso({ RequiereAvalExterno: 0 }).codigo).toBe('CAPACITACION_RA')
    expect(resolverClasificacionFiscalCurso({ RequiereAvalExterno: '0' }).codigo).toBe('CAPACITACION_RA')
  })

  it('15. RequiereAvalExterno=1 / "1" funciona (con aval)', () => {
    expect(resolverClasificacionFiscalCurso({ RequiereAvalExterno: 1 }).codigo).toBe('CAPACITACION')
    expect(resolverClasificacionFiscalCurso({ RequiereAvalExterno: '1' }).codigo).toBe('CAPACITACION')
  })

  it('16. RequiereAvalExterno vacío/ausente sin CRMOfferType -> fail closed', () => {
    expect(() => resolverClasificacionFiscalCurso({})).toThrow(/No se puede determinar si esta inscripción incluye aval externo/)
    expect(() => resolverClasificacionFiscalCurso({ RequiereAvalExterno: '' })).toThrow(/Clasifique la inscripción antes de facturar/)
    expect(() => resolverClasificacionFiscalCurso({ RequiereAvalExterno: null })).toThrow()
    expect(() => resolverClasificacionFiscalCurso({ RequiereAvalExterno: 'no-se-sabe' })).toThrow()
  })

  it('17. vacío + CRMOfferType=INSTITUTIONAL -> sin aval (fallback inequívoco)', () => {
    expect(resolverClasificacionFiscalCurso({ CRMOfferType: 'INSTITUTIONAL' }).codigo).toBe('CAPACITACION_RA')
  })

  it('18. vacío + CRMOfferType=FULL -> con aval (fallback inequívoco)', () => {
    expect(resolverClasificacionFiscalCurso({ CRMOfferType: 'FULL' }).codigo).toBe('CAPACITACION')
  })

  it('19. CRMOfferType=AVAL_UPGRADE nunca se usa como fallback -- fail closed igual que vacío (representa una compra adicional, no la clasificación base)', () => {
    expect(() => resolverClasificacionFiscalCurso({ CRMOfferType: 'AVAL_UPGRADE' })).toThrow(/No se puede determinar/)
  })

  it('RequiereAvalExterno explícito tiene prioridad sobre CRMOfferType aunque ambos estén presentes', () => {
    // CRMOfferType=FULL sugeriría "con aval", pero RequiereAvalExterno=false es la fuente primaria.
    expect(resolverClasificacionFiscalCurso({ RequiereAvalExterno: false, CRMOfferType: 'FULL' }).codigo).toBe('CAPACITACION_RA')
  })

  it('G. Caso Alexander (fixture equivalente, sin datos personales sensibles): $20 + sin aval -> CAPACITACION_RA, sin ITSAL', () => {
    const r = resolverClasificacionFiscalCurso({ RequiereAvalExterno: false, Monto: 20 })
    const descripcion = `IA para Apoyo en Tareas Académicas - ${r.descripcionSufijo}`
    expect(r.codigo).toBe('CAPACITACION_RA')
    expect(descripcion).toBe('IA para Apoyo en Tareas Académicas - Curso R.A. Training')
    expect(descripcion).not.toMatch(/ITSAL/)
    expect(descripcion).not.toMatch(/avalado/)
    expect(descripcion).not.toMatch(/aval externo/)
  })
})

describe('POST /api/fiscal/from-inscripcion — clasificación fiscal end-to-end', () => {
  it('G. caso Alexander completo: EstadoPago verificado + RequiereAvalExterno=false + $20 -> DRAFT con CAPACITACION_RA', async () => {
    inscripcionesFixture = [validInscripcion({
      ID: 'INS-ALEXANDER', ClienteNombre: 'Cliente Anonimizado', Monto: 20,
      ServicioNombre: 'IA para Apoyo en Tareas Académicas', RequiereAvalExterno: false,
    })]
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-ALEXANDER' } }, res)

    expect(callsFor('crearBorradorFactura')).toHaveLength(1)
    const payload = callsFor('crearBorradorFactura')[0][1]
    expect(payload.items[0].codigo).toBe('CAPACITACION_RA')
    expect(payload.items[0].descripcion).toBe('IA para Apoyo en Tareas Académicas - Curso R.A. Training')
    expect(payload.items[0].taxRateBasisPoints).toBe(0)
    expect(payload.items[0].descripcion).not.toMatch(/ITSAL/)
    expect(payload.items[0].descripcion).not.toMatch(/avalado/)
    expect(res.statusCode).toBe(200)
  })

  it('20/21/22. clasificación ambigua -> FAIL CLOSED antes del DRAFT: 0 crearBorradorFactura, 0 reservarSecuencialFiscal, 0 acciones SRI', async () => {
    inscripcionesFixture = [validInscripcion({ RequiereAvalExterno: undefined, CRMOfferType: undefined })]
    delete inscripcionesFixture[0].RequiereAvalExterno
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-1' } }, res)

    expect(res.statusCode).toBe(422)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toMatch(/No se puede determinar si esta inscripción incluye aval externo/)
    expect(callsFor('crearBorradorFactura')).toHaveLength(0)
    expect(callsFor('reservarSecuencialFiscal')).toHaveLength(0)
    expect(continuarFlujoFacturaMock).not.toHaveBeenCalled()
  })

  it('clasificación ambigua con CRMOfferType=AVAL_UPGRADE también bloquea (no se usa como fallback de clasificación base)', async () => {
    inscripcionesFixture = [validInscripcion({ CRMOfferType: 'AVAL_UPGRADE' })]
    delete inscripcionesFixture[0].RequiereAvalExterno
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-1' } }, res)

    expect(res.statusCode).toBe(422)
    expect(callsFor('crearBorradorFactura')).toHaveLength(0)
  })

  it('CRMOfferType=INSTITUTIONAL sin RequiereAvalExterno explícito clasifica sin aval de forma end-to-end', async () => {
    inscripcionesFixture = [validInscripcion({ CRMOfferType: 'INSTITUTIONAL' })]
    delete inscripcionesFixture[0].RequiereAvalExterno
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-1' } }, res)

    expect(callsFor('crearBorradorFactura')[0][1].items[0].codigo).toBe('CAPACITACION_RA')
  })
})

describe('Fiscal.gs / motor SRI', () => {
  it('no se invoca ninguna acción de firma/SOAP/SRI real (continuarFlujoFactura solo se llama si hay llaves configuradas)', async () => {
    const res = mockRes()
    await handler({ method: 'POST', body: { token: 'tok', inscripcionId: 'INS-1' } }, res)
    expect(continuarFlujoFacturaMock).not.toHaveBeenCalled()
  })
})
