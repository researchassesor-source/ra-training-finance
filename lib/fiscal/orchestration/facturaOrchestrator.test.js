import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createAppsScriptHarness } from '../../../src/test/appsScriptHarness.js'
import { generarYFirmarFactura, enviarFacturaARecepcion, consultarYActualizarAutorizacion, continuarFlujoFactura, reconciliarSubmittingEnvejecido, buildXmlParaFactura, OrchestratorError } from './facturaOrchestrator.js'
import { SUBMITTING_TOO_RECENT_MS, SUBMITTING_SAFE_RESEND_MS, POLL_MAX_ATTEMPTS, POLL_MAX_AGE_MS } from './backoff.js'
import { parseP12, privateKeyToPem, certificateToPemAndBase64 } from '../p12.js'
import { buildTestP12Buffer } from '../testFixtures.p12.js'
import {
  FIXTURE_RECIBIDA,
  FIXTURE_DEVUELTA_UN_MENSAJE,
  FIXTURE_SOAP_FAULT,
  AUTORIZACION_FIXTURES,
  fakeFetch,
  fakeFetchTimeout,
  fakeFetchNetworkError,
} from '../sri/sri.fixtures.js'

const FUTURE = '2099-01-01T00:00:00.000Z'
const SERVICE_TOKEN = 'servicio-fiscal-secreto-de-prueba'
const RUC = '0691787373001'

const EMISOR = {
  ruc: RUC,
  razonSocial: 'RESEARCH ASSESSOR TRAINING S.A.S.',
  nombreComercial: 'RA-TRAINING',
  dirMatriz: 'Barrio de los Maestros, calle Bielorusia, Riobamba',
  obligadoContabilidad: true,
}

function testSigningKeys() {
  const { buffer, password } = buildTestP12Buffer({ password: 'clave-de-prueba-orquestador' })
  const { certificate, privateKey } = parseP12(buffer, password)
  const { pem: certificatePem, base64: certificateBase64 } = certificateToPemAndBase64(certificate)
  return { privateKeyPem: privateKeyToPem(privateKey), certificatePem, certificateBase64, certificate }
}

/** El fetchImpl de gasOptions llama al harness real de Apps Script -- integración
 * genuina orquestador Node <-> Fiscal.gs, no un mock de juguete. */
function gasHarnessOptions(harness) {
  return {
    gasUrl: 'https://script.google.com/macros/s/fixture-de-prueba/exec',
    serviceToken: SERVICE_TOKEN,
    fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body)
      const result = harness.context.processRequest(body)
      return { ok: true, status: 200, json: async () => result }
    },
  }
}

function seededHarness() {
  const harness = createAppsScriptHarness()
  harness.seed('Sesiones', [{ Token: 'admin-token', Username: 'admin.test', UserID: 'USR-A', Rol: 'admin', Nombre: 'Admin Test', Expira: FUTURE }])
  harness.seed('Usuarios', [{ ID: 'USR-A', Nombre: 'Admin Test', Username: 'admin.test', Rol: 'admin', Activo: true }])
  harness.seed('AuditoriaFiscal', [])
  harness.seed('FacturasFiscales', [])
  harness.seed('FacturaItems', [])
  harness.seed('SecuenciaFiscal', [])
  harness.seed('ConfiguracionFiscal', [])
  harness.properties.set('FISCAL_SERVICE_TOKEN', SERVICE_TOKEN)
  harness.properties.set('SRI_MIGRATION_CONFIRMATION', 'APPLY_SRI_MIGRATION_ONCE')
  harness.context.processRequest({ action: 'migrarModuloFiscal', token: 'admin-token', confirmacion: 'APLICAR_MODULO_FISCAL' })
  return harness
}

function crearYReservar(harness, idempotencyKey = `idem-${Math.random()}`) {
  const draft = harness.context.processRequest({
    action: 'crearBorradorFactura',
    token: 'admin-token',
    environment: 'test',
    idempotencyKey,
    buyerIdentificationType: 'cedula',
    buyerIdentification: '0804655462',
    buyerName: 'Angel David Espinoza Ureta',
    items: [{ codigo: 'CAPACITACION', descripcion: 'Curso de prueba', cantidad: 1, precioUnitarioCents: 100, taxRateBasisPoints: 0, baseCents: 100, totalCents: 100 }],
    taxTotal: 0,
    grandTotal: 100,
  }).data
  harness.context.processRequest({ action: 'reservarSecuencialFiscal', token: 'admin-token', facturaId: draft.ID, establishment: '001', emissionPoint: '002' })
  return draft.ID
}

function facturaActual(harness, facturaId) {
  return harness.context.processRequest({ action: 'getFacturasFiscales', token: 'admin-token' }).data.find(f => f.ID === facturaId)
}

describe('generarYFirmarFactura', () => {
  it('bloquea XML productivo sin SriPaymentCode antes de firmar o transmitir', () => {
    const factura = {
      ID: 'FACT-PROD-SIN-PAGO',
      Environment: 'production',
      Establishment: '001',
      EmissionPoint: '002',
      Sequential: '000000001',
      IssueDate: '2026-08-13T12:00:00.000Z',
      BuyerIdentificationType: '05',
      BuyerIdentification: '1804417424',
      BuyerName: 'Andrea Carolina Hinostroza Medina',
      BuyerAddress: 'Riobamba',
      SubtotalWithoutTax: 800,
      DiscountCents: 0,
      GrandTotal: 800,
      SriPaymentCode: '',
    }
    const items = [{
      Codigo: 'CAPACITACION',
      Descripcion: 'Habilidades blandas para profesionales',
      Cantidad: 1,
      PrecioUnitarioCents: 800,
      DescuentoCents: 0,
      TaxRateBasisPoints: 0,
      SriTaxCode: '2:0',
      BaseCents: 800,
      TotalCents: 800,
    }]

    expect(() => buildXmlParaFactura(factura, items, '1308202601069178737300120010020000000019473817618', EMISOR))
      .toThrow(OrchestratorError)
  })

  it('genera y firma, dejando la factura en SIGNED con hashes persistidos', async () => {
    const harness = seededHarness()
    const facturaId = crearYReservar(harness)
    const gasOptions = gasHarnessOptions(harness)
    const result = await generarYFirmarFactura(facturaId, { environment: 'test', emisor: EMISOR, signingKeys: testSigningKeys(), gasOptions })
    expect(result.skipped).toBe(false)
    expect(result.signedXml).toContain('<ds:Signature')
    expect(result.factura.Status).toBe('SIGNED')
    expect(result.factura.Sha256Signed).toMatch(/^[0-9a-f]{64}$/)
    expect(result.claveAcceso).toMatch(/^\d{49}$/)
  })

  it('es idempotente: si ya pasó de SIGNED, no regenera ni vuelve a tocar la clave privada', async () => {
    const harness = seededHarness()
    const facturaId = crearYReservar(harness)
    const gasOptions = gasHarnessOptions(harness)
    const primero = await generarYFirmarFactura(facturaId, { environment: 'test', emisor: EMISOR, signingKeys: testSigningKeys(), gasOptions })
    await enviarFacturaARecepcion(facturaId, primero.signedXml, { environment: 'test', gasOptions, sriOptions: { fetchImpl: fakeFetch(FIXTURE_RECIBIDA) } })
    const segundo = await generarYFirmarFactura(facturaId, { environment: 'test', emisor: EMISOR, signingKeys: testSigningKeys(), gasOptions })
    expect(segundo.skipped).toBe(true)
  })
})

describe('normalización de códigos fiscales ante corrupción de Sheets (ceros a la izquierda perdidos)', () => {
  // Simula exactamente lo que le pasó a la factura real FACT_1786427014475_WZ5MR:
  // la celda ya perdió los ceros a la izquierda (Sheets la guardó como número), sin
  // pasar por ningún código nuestro -- se edita el dato crudo directamente, como si
  // Sheets ya lo hubiera devuelto así.
  function corromperCodigoFiscal(harness, sheetName, facturaId, campo, valorNumerico) {
    const sheet = harness.sheets[sheetName]
    const headers = sheet.rows[0]
    const idIdx = headers.indexOf('ID')
    const campoIdx = headers.indexOf(campo)
    const rowIndex = sheet.rows.findIndex((row, i) => i > 0 && row[idIdx] === facturaId)
    sheet.rows[rowIndex][campoIdx] = valorNumerico
  }

  it('Sheets devuelve Establishment=1, EmissionPoint=2, Sequential=1 (números) y el sistema produce igual 001, 002, 000000001 en el XML firmado y en la clave de acceso', async () => {
    const harness = seededHarness()
    const facturaId = crearYReservar(harness)
    const gasOptions = gasHarnessOptions(harness)

    corromperCodigoFiscal(harness, 'FacturasFiscales', facturaId, 'Establishment', 1)
    corromperCodigoFiscal(harness, 'FacturasFiscales', facturaId, 'EmissionPoint', 2)
    corromperCodigoFiscal(harness, 'FacturasFiscales', facturaId, 'Sequential', 1)

    const { signedXml, claveAcceso, factura } = await generarYFirmarFactura(facturaId, { environment: 'test', emisor: EMISOR, signingKeys: testSigningKeys(), gasOptions })

    expect(factura.Establishment).toBe('001')
    expect(factura.EmissionPoint).toBe('002')
    expect(factura.Sequential).toBe('000000001')
    expect(signedXml).toContain('<estab>001</estab>')
    expect(signedXml).toContain('<ptoEmi>002</ptoEmi>')
    expect(signedXml).toContain('<secuencial>000000001</secuencial>')
    // Offsets del 49-dígitos: fecha(8)+tipoComprobante(2)+ruc(13)+ambiente(1)=24 -> establecimiento[24:27], puntoEmision[27:30], secuencial[30:39]
    expect(claveAcceso.slice(24, 27)).toBe('001')
    expect(claveAcceso.slice(27, 30)).toBe('002')
    expect(claveAcceso.slice(30, 39)).toBe('000000001')
  })

  it('getFacturaFiscalCompleta por sí solo (sin pasar por generarYFirmarFactura) ya normaliza los códigos al leer', async () => {
    const harness = seededHarness()
    const facturaId = crearYReservar(harness)
    corromperCodigoFiscal(harness, 'FacturasFiscales', facturaId, 'Establishment', 1)
    corromperCodigoFiscal(harness, 'FacturasFiscales', facturaId, 'EmissionPoint', 2)

    const resultado = harness.context.processRequest({ action: 'getFacturaFiscalCompleta', serviceToken: SERVICE_TOKEN, facturaId })
    expect(resultado.data.factura.Establishment).toBe('001')
    expect(resultado.data.factura.EmissionPoint).toBe('002')
  })

  it('reservarSecuencialFiscal sigue encontrando el contador existente aunque SecuenciaFiscal tenga Establishment/EmissionPoint corruptos (continuidad del secuencial)', async () => {
    const harness = seededHarness()
    crearYReservar(harness)
    // SecuenciaFiscal no tiene FacturaID como clave -- corrompe la única fila sembrada directamente.
    const secuenciaSheet = harness.sheets['SecuenciaFiscal']
    const headers = secuenciaSheet.rows[0]
    secuenciaSheet.rows[1][headers.indexOf('Establishment')] = 1
    secuenciaSheet.rows[1][headers.indexOf('EmissionPoint')] = 2

    // crearYReservar ya incluye su propia llamada a reservarSecuencialFiscal.
    const segundoFacturaId = crearYReservar(harness, 'idem-segunda-factura')
    // Si la comparación no normalizara, no encontraría el contador corrupto y reiniciaría en 1 (colisión con la primera factura).
    expect(facturaActual(harness, segundoFacturaId).Sequential).toBe('000000002')
  })
})

describe('enviarFacturaARecepcion', () => {
  async function facturaFirmada(harness) {
    const facturaId = crearYReservar(harness)
    const gasOptions = gasHarnessOptions(harness)
    const { signedXml } = await generarYFirmarFactura(facturaId, { environment: 'test', emisor: EMISOR, signingKeys: testSigningKeys(), gasOptions })
    return { facturaId, signedXml, gasOptions }
  }

  it('RECIBIDA deja la factura en PROCESSING con NextPollAt agendado', async () => {
    const harness = seededHarness()
    const { facturaId, signedXml, gasOptions } = await facturaFirmada(harness)
    const result = await enviarFacturaARecepcion(facturaId, signedXml, { environment: 'test', gasOptions, sriOptions: { fetchImpl: fakeFetch(FIXTURE_RECIBIDA) } })
    expect(result.outcome).toBe('RECEIVED')
    const f = facturaActual(harness, facturaId)
    expect(f.Status).toBe('PROCESSING')
    expect(f.NextPollAt).toBeTruthy()
  })

  it('DEVUELTA deja la factura en RETURNED con los mensajes del SRI guardados', async () => {
    const harness = seededHarness()
    const { facturaId, signedXml, gasOptions } = await facturaFirmada(harness)
    const result = await enviarFacturaARecepcion(facturaId, signedXml, { environment: 'test', gasOptions, sriOptions: { fetchImpl: fakeFetch(FIXTURE_DEVUELTA_UN_MENSAJE) } })
    expect(result.outcome).toBe('RETURNED')
    const f = facturaActual(harness, facturaId)
    expect(f.Status).toBe('RETURNED')
    expect(f.LastSriMessage).toMatch(/DOCUMENTO INVALIDO/)
  })

  it('timeout ANTES de completar Recepción MANTIENE el claim en SUBMITTING (nunca retrocede a SIGNED a ciegas)', async () => {
    const harness = seededHarness()
    const { facturaId, signedXml, gasOptions } = await facturaFirmada(harness)
    const result = await enviarFacturaARecepcion(facturaId, signedXml, { environment: 'test', gasOptions, sriOptions: { fetchImpl: fakeFetchTimeout() } })
    expect(result.outcome).toBe('TIMEOUT')
    expect(result.message).toBeTruthy()
    const f = facturaActual(harness, facturaId)
    expect(f.Status).toBe('SUBMITTING') // el SRI pudo haber recibido el XML; no se libera el claim a ciegas
    expect(Number(f.RetryCount)).toBe(0) // no se escribe nada en Sheets aquí; RetryCount lo sube la reconciliación si libera el claim
  })

  it('error de red se comporta igual que timeout: mantiene el claim en SUBMITTING para reconciliar, no reintenta solo', async () => {
    const harness = seededHarness()
    const { facturaId, signedXml, gasOptions } = await facturaFirmada(harness)
    const result = await enviarFacturaARecepcion(facturaId, signedXml, { environment: 'test', gasOptions, sriOptions: { fetchImpl: fakeFetchNetworkError() } })
    expect(result.outcome).toBe('NETWORK_ERROR')
    expect(facturaActual(harness, facturaId).Status).toBe('SUBMITTING')
  })

  it('SOAP Fault se comporta igual que un timeout: mantiene el claim en SUBMITTING', async () => {
    const harness = seededHarness()
    const { facturaId, signedXml, gasOptions } = await facturaFirmada(harness)
    const result = await enviarFacturaARecepcion(facturaId, signedXml, { environment: 'test', gasOptions, sriOptions: { fetchImpl: fakeFetch(FIXTURE_SOAP_FAULT, { status: 500, ok: false, statusText: 'Error' }) } })
    expect(result.outcome).toBe('SOAP_FAULT')
    expect(facturaActual(harness, facturaId).Status).toBe('SUBMITTING')
  })

  it('doble ejecución (o concurrencia): la segunda llamada nunca vuelve a enviar al SRI porque el claim ya no está en SIGNED', async () => {
    const harness = seededHarness()
    const { facturaId, signedXml, gasOptions } = await facturaFirmada(harness)
    let llamadasAlSri = 0
    const sriOptions = { fetchImpl: fakeFetch(FIXTURE_RECIBIDA) }
    const sriOptionsContadas = { fetchImpl: async (...args) => { llamadasAlSri += 1; return sriOptions.fetchImpl(...args) } }

    const primero = await enviarFacturaARecepcion(facturaId, signedXml, { environment: 'test', gasOptions, sriOptions: sriOptionsContadas })
    const segundo = await enviarFacturaARecepcion(facturaId, signedXml, { environment: 'test', gasOptions, sriOptions: sriOptionsContadas })

    expect(primero.outcome).toBe('RECEIVED')
    expect(segundo.outcome).toBe('ALREADY_IN_PROGRESS_OR_ADVANCED')
    expect(llamadasAlSri).toBe(1) // el segundo intento nunca llegó a llamar al SRI
  })

  it('la petición nunca se dirige a Producción (siempre celcer, nunca cel) durante Fase 6', async () => {
    const harness = seededHarness()
    const { facturaId, signedXml, gasOptions } = await facturaFirmada(harness)
    let urlLlamada = null
    await enviarFacturaARecepcion(facturaId, signedXml, {
      environment: 'test', gasOptions,
      sriOptions: { fetchImpl: async (url, init) => { urlLlamada = url; return { ok: true, status: 200, statusText: 'OK', text: async () => FIXTURE_RECIBIDA } } },
    })
    expect(urlLlamada).toContain('celcer.sri.gob.ec')
  })
})

describe('consultarYActualizarAutorizacion', () => {
  async function facturaRecibida(harness) {
    const facturaId = crearYReservar(harness)
    const gasOptions = gasHarnessOptions(harness)
    const { signedXml } = await generarYFirmarFactura(facturaId, { environment: 'test', emisor: EMISOR, signingKeys: testSigningKeys(), gasOptions })
    await enviarFacturaARecepcion(facturaId, signedXml, { environment: 'test', gasOptions, sriOptions: { fetchImpl: fakeFetch(FIXTURE_RECIBIDA) } })
    return { facturaId, gasOptions }
  }

  it('flujo completo simulado: AUTORIZADO deja la factura en DELIVERY_PENDING con número de autorización', async () => {
    const harness = seededHarness()
    const { facturaId, gasOptions } = await facturaRecibida(harness)
    const claveAcceso = facturaActual(harness, facturaId).AccessKey
    const result = await consultarYActualizarAutorizacion(facturaId, {
      environment: 'test', gasOptions,
      sriOptions: { fetchImpl: fakeFetch(AUTORIZACION_FIXTURES.autorizado({ claveAcceso })) },
    })
    expect(result.outcome).toBe('AUTHORIZED')
    const f = facturaActual(harness, facturaId)
    expect(f.Status).toBe('DELIVERY_PENDING')
    expect(f.AuthorizationNumber).toBeTruthy()
    expect(f.XmlAuthorizedContent).toContain('<factura')
  })

  it('NO_AUTORIZADO deja la factura en NOT_AUTHORIZED (terminal)', async () => {
    const harness = seededHarness()
    const { facturaId, gasOptions } = await facturaRecibida(harness)
    const claveAcceso = facturaActual(harness, facturaId).AccessKey
    const result = await consultarYActualizarAutorizacion(facturaId, {
      environment: 'test', gasOptions,
      sriOptions: { fetchImpl: fakeFetch(AUTORIZACION_FIXTURES.noAutorizado({ claveAcceso })) },
    })
    expect(result.outcome).toBe('NOT_AUTHORIZED')
    expect(facturaActual(harness, facturaId).Status).toBe('NOT_AUTHORIZED')
  })

  it('EN_PROCESO mantiene PROCESSING, agenda NextPollAt y sube RetryCount (procesamiento pendiente)', async () => {
    const harness = seededHarness()
    const { facturaId, gasOptions } = await facturaRecibida(harness)
    const claveAcceso = facturaActual(harness, facturaId).AccessKey
    const antes = facturaActual(harness, facturaId)
    const result = await consultarYActualizarAutorizacion(facturaId, {
      environment: 'test', gasOptions,
      sriOptions: { fetchImpl: fakeFetch(AUTORIZACION_FIXTURES.enProceso({ claveAcceso })) },
    })
    expect(result.outcome).toBe('EN_PROCESO')
    const despues = facturaActual(harness, facturaId)
    expect(despues.Status).toBe('PROCESSING')
    expect(Number(despues.RetryCount)).toBe(Number(antes.RetryCount || 0) + 1)
    expect(new Date(despues.NextPollAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('reintento posterior: EN_PROCESO y luego, en una llamada posterior, AUTORIZADO', async () => {
    const harness = seededHarness()
    const { facturaId, gasOptions } = await facturaRecibida(harness)
    const claveAcceso = facturaActual(harness, facturaId).AccessKey

    const primero = await consultarYActualizarAutorizacion(facturaId, { environment: 'test', gasOptions, sriOptions: { fetchImpl: fakeFetch(AUTORIZACION_FIXTURES.enProceso({ claveAcceso })) } })
    expect(primero.outcome).toBe('EN_PROCESO')

    const segundo = await consultarYActualizarAutorizacion(facturaId, { environment: 'test', gasOptions, sriOptions: { fetchImpl: fakeFetch(AUTORIZACION_FIXTURES.autorizado({ claveAcceso })) } })
    expect(segundo.outcome).toBe('AUTHORIZED')
  })

  it('timeout DESPUÉS de Recepción (durante el sondeo de autorización) no falla: agenda otro intento', async () => {
    const harness = seededHarness()
    const { facturaId, gasOptions } = await facturaRecibida(harness)
    const result = await consultarYActualizarAutorizacion(facturaId, { environment: 'test', gasOptions, sriOptions: { fetchImpl: fakeFetchTimeout() } })
    expect(result.outcome).toBe('TIMEOUT')
    expect(facturaActual(harness, facturaId).Status).toBe('PROCESSING')
  })

  it('doble polling sobre una factura ya AUTHORIZED es un no-op (ALREADY_RESOLVED), AUTHORIZED sigue siendo inmutable', async () => {
    const harness = seededHarness()
    const { facturaId, gasOptions } = await facturaRecibida(harness)
    const claveAcceso = facturaActual(harness, facturaId).AccessKey
    await consultarYActualizarAutorizacion(facturaId, { environment: 'test', gasOptions, sriOptions: { fetchImpl: fakeFetch(AUTORIZACION_FIXTURES.autorizado({ claveAcceso })) } })
    const auditoriaAntes = harness.objects('AuditoriaFiscal').length

    const segundaConsulta = await consultarYActualizarAutorizacion(facturaId, { environment: 'test', gasOptions, sriOptions: { fetchImpl: fakeFetch(AUTORIZACION_FIXTURES.noAutorizado({ claveAcceso })) } })

    expect(segundaConsulta.outcome).toBe('ALREADY_RESOLVED')
    expect(facturaActual(harness, facturaId).Status).toBe('DELIVERY_PENDING') // no retrocedió a NOT_AUTHORIZED
    expect(harness.objects('AuditoriaFiscal').length).toBe(auditoriaAntes) // no se creó ningún evento nuevo
  })
})

describe('reabrirFacturaRechazadaParaCorreccion — reapertura explícita de NOT_AUTHORIZED', () => {
  async function facturaRechazada(harness) {
    const facturaId = crearYReservar(harness)
    const gasOptions = gasHarnessOptions(harness)
    const { signedXml } = await generarYFirmarFactura(facturaId, { environment: 'test', emisor: EMISOR, signingKeys: testSigningKeys(), gasOptions })
    await enviarFacturaARecepcion(facturaId, signedXml, { environment: 'test', gasOptions, sriOptions: { fetchImpl: fakeFetch(FIXTURE_RECIBIDA) } })
    const claveAcceso = facturaActual(harness, facturaId).AccessKey
    await consultarYActualizarAutorizacion(facturaId, { environment: 'test', gasOptions, sriOptions: { fetchImpl: fakeFetch(AUTORIZACION_FIXTURES.noAutorizado({ claveAcceso })) } })
    return { facturaId, claveAcceso, gasOptions }
  }

  it('NOT_AUTHORIZED no se reenvía automáticamente (continuarFlujoFactura es un no-op)', async () => {
    const harness = seededHarness()
    const { facturaId, gasOptions } = await facturaRechazada(harness)
    const result = await continuarFlujoFactura(facturaId, { environment: 'test', gasOptions })
    expect(result.outcome).toBe('NO_ACTION')
    expect(facturaActual(harness, facturaId).Status).toBe('NOT_AUTHORIZED')
  })

  it('la operación explícita reabre para corrección: conserva FacturaID/clave/secuencial y deja Status=GENERATED', async () => {
    const harness = seededHarness()
    const { facturaId, claveAcceso } = await facturaRechazada(harness)
    const antes = facturaActual(harness, facturaId)
    const establishmentAntes = antes.Establishment
    const sequentialAntes = antes.Sequential

    const reabierta = harness.context.processRequest({
      action: 'reabrirFacturaRechazadaParaCorreccion', token: 'admin-token', facturaId, motivo: 'Firma corregida (orden RFC2253).',
    })
    expect(reabierta.success).toBe(true)
    expect(reabierta.data.Status).toBe('GENERATED')
    expect(reabierta.data.ID).toBe(facturaId)
    expect(reabierta.data.AccessKey).toBe(claveAcceso) // misma clave
    expect(reabierta.data.Establishment).toBe(establishmentAntes)
    expect(reabierta.data.Sequential).toBe(sequentialAntes) // mismo secuencial, nunca uno nuevo
  })

  it('la auditoría conserva el rechazo previo: el evento de reapertura registra el motivo del rechazo, y el evento original de NOT_AUTHORIZED sigue presente', async () => {
    const harness = seededHarness()
    const { facturaId } = await facturaRechazada(harness)
    const mensajeRechazo = facturaActual(harness, facturaId).LastSriMessage

    harness.context.processRequest({ action: 'reabrirFacturaRechazadaParaCorreccion', token: 'admin-token', facturaId, motivo: 'Firma corregida.' })

    const eventos = harness.objects('AuditoriaFiscal').filter(e => e.FacturaID === facturaId)
    const eventoRechazoOriginal = eventos.find(e => e.EstadoNuevo === 'NOT_AUTHORIZED')
    const eventoReapertura = eventos.find(e => e.Accion === 'FACTURA_REOPEN_FOR_CORRECTION')
    expect(eventoRechazoOriginal).toBeTruthy() // no se borró
    expect(eventoReapertura).toBeTruthy()
    expect(eventoReapertura.EstadoAnterior).toBe('NOT_AUTHORIZED')
    expect(eventoReapertura.Metadatos).toContain(mensajeRechazo)
  })

  it('no permite reabrir una factura AUTHORIZED', async () => {
    const harness = seededHarness()
    const facturaId = crearYReservar(harness)
    const gasOptions = gasHarnessOptions(harness)
    const { signedXml } = await generarYFirmarFactura(facturaId, { environment: 'test', emisor: EMISOR, signingKeys: testSigningKeys(), gasOptions })
    await enviarFacturaARecepcion(facturaId, signedXml, { environment: 'test', gasOptions, sriOptions: { fetchImpl: fakeFetch(FIXTURE_RECIBIDA) } })
    const claveAcceso = facturaActual(harness, facturaId).AccessKey
    await consultarYActualizarAutorizacion(facturaId, { environment: 'test', gasOptions, sriOptions: { fetchImpl: fakeFetch(AUTORIZACION_FIXTURES.autorizado({ claveAcceso })) } })
    expect(facturaActual(harness, facturaId).Status).toBe('DELIVERY_PENDING')

    const intento = harness.context.processRequest({ action: 'reabrirFacturaRechazadaParaCorreccion', token: 'admin-token', facturaId, motivo: 'Intento indebido.' })
    expect(intento.success).toBe(false)
    expect(facturaActual(harness, facturaId).Status).toBe('DELIVERY_PENDING') // sin cambios
  })

  it('no acepta serviceToken -- es una decisión humana, no un allowlist server-to-server', async () => {
    const harness = seededHarness()
    const { facturaId } = await facturaRechazada(harness)
    const intento = harness.context.processRequest({ action: 'reabrirFacturaRechazadaParaCorreccion', serviceToken: SERVICE_TOKEN, facturaId, motivo: 'Intento vía serviceToken.' })
    expect(intento.success).toBe(false)
    expect(facturaActual(harness, facturaId).Status).toBe('NOT_AUTHORIZED') // sin cambios
  })

  it('doble reapertura no provoca doble envío: la segunda reapertura es rechazada, y tras la primera el mutex SIGNED->SUBMITTING sigue protegiendo un reenvío duplicado', async () => {
    const harness = seededHarness()
    const { facturaId, gasOptions } = await facturaRechazada(harness)

    const primera = harness.context.processRequest({ action: 'reabrirFacturaRechazadaParaCorreccion', token: 'admin-token', facturaId, motivo: 'Primera reapertura.' })
    expect(primera.success).toBe(true)
    const segunda = harness.context.processRequest({ action: 'reabrirFacturaRechazadaParaCorreccion', token: 'admin-token', facturaId, motivo: 'Segunda reapertura.' })
    expect(segunda.success).toBe(false) // ya no está en NOT_AUTHORIZED

    const { signedXml } = await generarYFirmarFactura(facturaId, { environment: 'test', emisor: EMISOR, signingKeys: testSigningKeys(), gasOptions })
    let llamadasAlSri = 0
    const sriOptionsContadas = { fetchImpl: async (...args) => { llamadasAlSri += 1; return fakeFetch(FIXTURE_RECIBIDA)(...args) } }
    const envio1 = await enviarFacturaARecepcion(facturaId, signedXml, { environment: 'test', gasOptions, sriOptions: sriOptionsContadas })
    const envio2 = await enviarFacturaARecepcion(facturaId, signedXml, { environment: 'test', gasOptions, sriOptions: sriOptionsContadas })
    expect(envio1.outcome).toBe('RECEIVED')
    expect(envio2.outcome).toBe('ALREADY_IN_PROGRESS_OR_ADVANCED')
    expect(llamadasAlSri).toBe(1)
  })

  it('el script CLI TEST_ONLY exige environment=test, la FacturaID exacta y rechazo previo antes de reabrir, y usa login humano real (no serviceToken)', () => {
    const scriptSource = readFileSync(join(process.cwd(), 'scripts/enviar-primera-factura-sri-pruebas.mjs'), 'utf8')
    expect(scriptSource).toContain("ENVIRONMENT === 'test'")
    expect(scriptSource).toContain("FACTURA_ID === 'FACT_1786427014475_WZ5MR'")
    expect(scriptSource).toContain('factura.LastSriMessage') // exige rechazo previo
    expect(scriptSource).toContain('callGasLogin')
    expect(scriptSource).toContain('FISCAL_ADMIN_USERNAME')
    expect(scriptSource).not.toContain('FISCAL_USER_TOKEN')
    // La llamada de reapertura usa callGasActionAsUser con el token recién emitido por login.
    expect(scriptSource).toMatch(/callGasActionAsUser\(\s*'reabrirFacturaRechazadaParaCorreccion'/)
  })
})

describe('continuarFlujoFactura — recuperación tras reinicio', () => {
  it('retoma desde SIGNED (el proceso murió antes de enviar a Recepción) y completa hasta PROCESSING', async () => {
    const harness = seededHarness()
    const facturaId = crearYReservar(harness)
    const gasOptions = gasHarnessOptions(harness)
    await generarYFirmarFactura(facturaId, { environment: 'test', emisor: EMISOR, signingKeys: testSigningKeys(), gasOptions })
    expect(facturaActual(harness, facturaId).Status).toBe('SIGNED')

    const result = await continuarFlujoFactura(facturaId, { environment: 'test', emisor: EMISOR, signingKeys: testSigningKeys(), gasOptions, sriOptions: { fetchImpl: fakeFetch(FIXTURE_RECIBIDA) } })
    expect(result.outcome).toBe('RECEIVED')
    expect(facturaActual(harness, facturaId).Status).toBe('PROCESSING')
  })

  it('retoma desde RECEIVED/PROCESSING sondeando autorización', async () => {
    const harness = seededHarness()
    const facturaId = crearYReservar(harness)
    const gasOptions = gasHarnessOptions(harness)
    const { signedXml } = await generarYFirmarFactura(facturaId, { environment: 'test', emisor: EMISOR, signingKeys: testSigningKeys(), gasOptions })
    await enviarFacturaARecepcion(facturaId, signedXml, { environment: 'test', gasOptions, sriOptions: { fetchImpl: fakeFetch(FIXTURE_RECIBIDA) } })
    const claveAcceso = facturaActual(harness, facturaId).AccessKey

    const result = await continuarFlujoFactura(facturaId, { environment: 'test', gasOptions, sriOptions: { fetchImpl: fakeFetch(AUTORIZACION_FIXTURES.autorizado({ claveAcceso })) } })
    expect(result.outcome).toBe('AUTHORIZED')
  })

  it('una factura recién reclamada en SUBMITTING (muy reciente) no se reconcilia todavía: puede seguir en vuelo', async () => {
    const harness = seededHarness()
    const facturaId = crearYReservar(harness)
    const gasOptions = gasHarnessOptions(harness)
    await generarYFirmarFactura(facturaId, { environment: 'test', emisor: EMISOR, signingKeys: testSigningKeys(), gasOptions })
    harness.context.processRequest({ action: 'transicionEstadoFactura', serviceToken: SERVICE_TOKEN, facturaId, nuevoEstado: 'SUBMITTING' })

    const result = await continuarFlujoFactura(facturaId, { environment: 'test', gasOptions })
    expect(result.outcome).toBe('TOO_RECENT_TO_RECONCILE')
    expect(facturaActual(harness, facturaId).Status).toBe('SUBMITTING') // no se tocó
  })

  it('una factura ya DELIVERY_PENDING no requiere ninguna acción', async () => {
    const harness = seededHarness()
    const facturaId = crearYReservar(harness)
    const gasOptions = gasHarnessOptions(harness)
    const { signedXml } = await generarYFirmarFactura(facturaId, { environment: 'test', emisor: EMISOR, signingKeys: testSigningKeys(), gasOptions })
    await enviarFacturaARecepcion(facturaId, signedXml, { environment: 'test', gasOptions, sriOptions: { fetchImpl: fakeFetch(FIXTURE_RECIBIDA) } })
    const claveAcceso = facturaActual(harness, facturaId).AccessKey
    await consultarYActualizarAutorizacion(facturaId, { environment: 'test', gasOptions, sriOptions: { fetchImpl: fakeFetch(AUTORIZACION_FIXTURES.autorizado({ claveAcceso })) } })

    const result = await continuarFlujoFactura(facturaId, { environment: 'test', gasOptions })
    expect(result.outcome).toBe('NO_ACTION')
    expect(result.status).toBe('DELIVERY_PENDING')
  })
})

describe('reconciliarSubmittingEnvejecido — recuperación segura de SUBMITTING (sin reenvío ciego)', () => {
  async function facturaSubmitting(harness) {
    const facturaId = crearYReservar(harness)
    const gasOptions = gasHarnessOptions(harness)
    await generarYFirmarFactura(facturaId, { environment: 'test', emisor: EMISOR, signingKeys: testSigningKeys(), gasOptions })
    harness.context.processRequest({ action: 'transicionEstadoFactura', serviceToken: SERVICE_TOKEN, facturaId, nuevoEstado: 'SUBMITTING' })
    const claveAcceso = facturaActual(harness, facturaId).AccessKey
    return { facturaId, gasOptions, claveAcceso }
  }

  function contandoLlamadasRecepcion(fetchImpl) {
    let llamadas = 0
    return { fetchImpl: async (...args) => { llamadas += 1; return fetchImpl(...args) }, contador: () => llamadas }
  }

  it('timeout justo después de que el SRI recibió: la reconciliación encuentra AUTORIZADO sin volver a llamar a Recepción', async () => {
    const harness = seededHarness()
    const { facturaId, gasOptions, claveAcceso } = await facturaSubmitting(harness)
    const now = new Date(Date.now() + SUBMITTING_TOO_RECENT_MS + 60_000) // 3 min después del claim

    const result = await reconciliarSubmittingEnvejecido(facturaId, {
      environment: 'test', gasOptions, now,
      sriOptions: { fetchImpl: fakeFetch(AUTORIZACION_FIXTURES.autorizado({ claveAcceso })) },
    })

    expect(result.outcome).toBe('AUTHORIZED')
    expect(result.reconciled).toBe(true)
    expect(facturaActual(harness, facturaId).Status).toBe('DELIVERY_PENDING')
  })

  it('SRI recibió la factura pero la respuesta de Recepción se perdió (timeout local real, no seeded a mano): queda SUBMITTING, y la siguiente ejecución consulta Autorización primero, sin una segunda llamada a Recepción', async () => {
    const harness = seededHarness()
    const facturaId = crearYReservar(harness)
    const gasOptions = gasHarnessOptions(harness)
    const { signedXml } = await generarYFirmarFactura(facturaId, { environment: 'test', emisor: EMISOR, signingKeys: testSigningKeys(), gasOptions })
    const claveAcceso = facturaActual(harness, facturaId).AccessKey

    // Paso 1: intento real de envío que timeoutea localmente DESPUÉS de que (en este
    // escenario) el SRI ya recibió el XML — enviarFacturaARecepcion es quien reclama
    // SUBMITTING y quien decide qué hacer con la respuesta ambigua, no un seed manual.
    const espíaRecepcion = contandoLlamadasRecepcion(fakeFetchTimeout())
    const envio = await enviarFacturaARecepcion(facturaId, signedXml, { environment: 'test', gasOptions, sriOptions: { fetchImpl: espíaRecepcion.fetchImpl } })
    expect(envio.outcome).toBe('TIMEOUT')
    expect(espíaRecepcion.contador()).toBe(1)
    expect(facturaActual(harness, facturaId).Status).toBe('SUBMITTING') // se mantiene, no vuelve a SIGNED

    // Paso 2: "siguiente ejecución" — pasa la ventana segura y reconcilia contra
    // Autorización con la MISMA clave de acceso, encontrando que el SRI SÍ la conoce.
    const now = new Date(Date.now() + SUBMITTING_TOO_RECENT_MS + 60_000)
    const espíaAutorizacion = contandoLlamadasRecepcion(fakeFetch(AUTORIZACION_FIXTURES.autorizado({ claveAcceso })))
    const reconciliado = await continuarFlujoFactura(facturaId, { environment: 'test', gasOptions, now, sriOptions: { fetchImpl: espíaAutorizacion.fetchImpl } })

    expect(reconciliado.outcome).toBe('AUTHORIZED')
    expect(reconciliado.reconciled).toBe(true)
    expect(espíaAutorizacion.contador()).toBe(1) // una sola llamada SOAP (Autorización) — nunca una segunda Recepción
    expect(facturaActual(harness, facturaId).Status).toBe('DELIVERY_PENDING')
  })

  it('proceso reiniciado estando SUBMITTING: continuarFlujoFactura enruta a la reconciliación, no a un reenvío ciego', async () => {
    const harness = seededHarness()
    const { facturaId, gasOptions, claveAcceso } = await facturaSubmitting(harness)
    const now = new Date(Date.now() + SUBMITTING_TOO_RECENT_MS + 60_000)

    const result = await continuarFlujoFactura(facturaId, {
      environment: 'test', gasOptions, now,
      sriOptions: { fetchImpl: fakeFetch(AUTORIZACION_FIXTURES.autorizado({ claveAcceso })) },
    })
    expect(result.outcome).toBe('AUTHORIZED')
  })

  it('autorización NO_AUTORIZADA encontrada durante reconciliación también se reconcilia sin reenviar', async () => {
    const harness = seededHarness()
    const { facturaId, gasOptions, claveAcceso } = await facturaSubmitting(harness)
    const now = new Date(Date.now() + SUBMITTING_TOO_RECENT_MS + 60_000)

    const result = await reconciliarSubmittingEnvejecido(facturaId, {
      environment: 'test', gasOptions, now,
      sriOptions: { fetchImpl: fakeFetch(AUTORIZACION_FIXTURES.noAutorizado({ claveAcceso })) },
    })
    expect(result.outcome).toBe('NOT_AUTHORIZED')
    expect(facturaActual(harness, facturaId).Status).toBe('NOT_AUTHORIZED')
  })

  it('comprobante todavía procesando dentro de la ventana segura: no reenvía, se mantiene SUBMITTING', async () => {
    const harness = seededHarness()
    const { facturaId, gasOptions, claveAcceso } = await facturaSubmitting(harness)
    const now = new Date(Date.now() + SUBMITTING_TOO_RECENT_MS + 5 * 60_000) // dentro de la ventana de 15 min

    const result = await reconciliarSubmittingEnvejecido(facturaId, {
      environment: 'test', gasOptions, now,
      sriOptions: { fetchImpl: fakeFetch(AUTORIZACION_FIXTURES.enProceso({ claveAcceso })) },
    })
    expect(result.outcome).toBe('STILL_AMBIGUOUS_KEEP_WAITING')
    expect(facturaActual(harness, facturaId).Status).toBe('SUBMITTING')
    expect(facturaActual(harness, facturaId).AccessKey).toBe(claveAcceso) // no cambió nada
  })

  it('clave aún no encontrada pasada la ventana segura: se libera para reenvío controlado con la MISMA clave/secuencial', async () => {
    const harness = seededHarness()
    const { facturaId, gasOptions, claveAcceso } = await facturaSubmitting(harness)
    const secuencialOriginal = facturaActual(harness, facturaId).Sequential
    const now = new Date(Date.now() + SUBMITTING_SAFE_RESEND_MS + 60_000) // pasada la ventana de 15 min

    const result = await reconciliarSubmittingEnvejecido(facturaId, {
      environment: 'test', gasOptions, now,
      sriOptions: { fetchImpl: fakeFetch(AUTORIZACION_FIXTURES.enProceso({ claveAcceso })) },
    })
    expect(result.outcome).toBe('RELEASED_FOR_CONTROLLED_RESEND')
    const factura = facturaActual(harness, facturaId)
    expect(factura.Status).toBe('SIGNED')
    expect(factura.AccessKey).toBe(claveAcceso) // misma clave de acceso
    expect(factura.Sequential).toBe(secuencialOriginal) // mismo secuencial, nunca una factura nueva
  })

  it('ninguna segunda llamada a Recepción ocurre durante la reconciliación cuando ya existe en Autorización', async () => {
    const harness = seededHarness()
    const { facturaId, gasOptions, claveAcceso } = await facturaSubmitting(harness)
    const now = new Date(Date.now() + SUBMITTING_TOO_RECENT_MS + 60_000)
    const espía = contandoLlamadasRecepcion(fakeFetch(AUTORIZACION_FIXTURES.autorizado({ claveAcceso })))

    await reconciliarSubmittingEnvejecido(facturaId, { environment: 'test', gasOptions, now, sriOptions: { fetchImpl: espía.fetchImpl } })

    // La única llamada SOAP posible durante la reconciliación es a Autorización
    // (consultarAutorizacion) — reconciliarSubmittingEnvejecido nunca invoca
    // enviarRecepcion. El espía cuenta toda invocación de fetch; con un solo
    // resultado AUTORIZADO no debería haber más de una llamada SOAP real.
    expect(espía.contador()).toBe(1)
  })
})

describe('polling finito — REQUIRES_REVIEW en vez de reintentar para siempre', () => {
  async function facturaEnProcessing(harness) {
    const facturaId = crearYReservar(harness)
    const gasOptions = gasHarnessOptions(harness)
    const { signedXml } = await generarYFirmarFactura(facturaId, { environment: 'test', emisor: EMISOR, signingKeys: testSigningKeys(), gasOptions })
    await enviarFacturaARecepcion(facturaId, signedXml, { environment: 'test', gasOptions, sriOptions: { fetchImpl: fakeFetch(FIXTURE_RECIBIDA) } })
    const claveAcceso = facturaActual(harness, facturaId).AccessKey
    return { facturaId, gasOptions, claveAcceso }
  }

  it('al alcanzar el límite de intentos, se suspende con ReviewFlag=REQUIRES_REVIEW y el Status sigue siendo PROCESSING (no se inventa un estado del SRI)', async () => {
    const harness = seededHarness()
    const { facturaId, gasOptions, claveAcceso } = await facturaEnProcessing(harness)
    // Salta directo al penúltimo intento en vez de sondear 50 veces reales.
    harness.context.processRequest({ action: 'transicionEstadoFactura', serviceToken: SERVICE_TOKEN, facturaId, nuevoEstado: 'PROCESSING', camposAdicionales: { RetryCount: POLL_MAX_ATTEMPTS - 1 } })

    const result = await consultarYActualizarAutorizacion(facturaId, { environment: 'test', gasOptions, sriOptions: { fetchImpl: fakeFetch(AUTORIZACION_FIXTURES.enProceso({ claveAcceso })) } })

    expect(result.outcome).toBe('REQUIRES_REVIEW')
    const factura = facturaActual(harness, facturaId)
    expect(factura.Status).toBe('PROCESSING') // estado SRI real, no inventado
    expect(factura.ReviewFlag).toBe('REQUIRES_REVIEW')
    expect(factura.ReviewReason).toBeTruthy()
  })

  it('también se suspende por antigüedad aunque no se hayan agotado los intentos', async () => {
    const harness = seededHarness()
    const { facturaId, gasOptions, claveAcceso } = await facturaEnProcessing(harness)
    const now = new Date(Date.now() + POLL_MAX_AGE_MS + 60_000) // más vieja que el máximo permitido

    const result = await consultarYActualizarAutorizacion(facturaId, { environment: 'test', gasOptions, now, sriOptions: { fetchImpl: fakeFetch(AUTORIZACION_FIXTURES.enProceso({ claveAcceso })) } })

    expect(result.outcome).toBe('REQUIRES_REVIEW')
    expect(facturaActual(harness, facturaId).ReviewFlag).toBe('REQUIRES_REVIEW')
  })

  it('una vez suspendida, NO se vuelve a llamar automáticamente al SRI (ni un doble polling la reactiva)', async () => {
    const harness = seededHarness()
    const { facturaId, gasOptions, claveAcceso } = await facturaEnProcessing(harness)
    harness.context.processRequest({ action: 'transicionEstadoFactura', serviceToken: SERVICE_TOKEN, facturaId, nuevoEstado: 'PROCESSING', camposAdicionales: { RetryCount: POLL_MAX_ATTEMPTS - 1 } })
    await consultarYActualizarAutorizacion(facturaId, { environment: 'test', gasOptions, sriOptions: { fetchImpl: fakeFetch(AUTORIZACION_FIXTURES.enProceso({ claveAcceso })) } })
    expect(facturaActual(harness, facturaId).ReviewFlag).toBe('REQUIRES_REVIEW')

    let fetchLlamado = false
    const result = await consultarYActualizarAutorizacion(facturaId, { environment: 'test', gasOptions, sriOptions: { fetchImpl: async () => { fetchLlamado = true; return { ok: true, status: 200, statusText: 'OK', text: async () => AUTORIZACION_FIXTURES.enProceso({ claveAcceso }) } } } })

    expect(result.outcome).toBe('SUSPENDED_FOR_REVIEW')
    expect(fetchLlamado).toBe(false) // nunca llegó a llamar al SRI
  })

  it('una factura suspendida no aparece en listarFacturasPendientesDePolling, aunque su NextPollAt esté vacío', async () => {
    const harness = seededHarness()
    const { facturaId, gasOptions, claveAcceso } = await facturaEnProcessing(harness)
    harness.context.processRequest({ action: 'transicionEstadoFactura', serviceToken: SERVICE_TOKEN, facturaId, nuevoEstado: 'PROCESSING', camposAdicionales: { RetryCount: POLL_MAX_ATTEMPTS - 1 } })
    await consultarYActualizarAutorizacion(facturaId, { environment: 'test', gasOptions, sriOptions: { fetchImpl: fakeFetch(AUTORIZACION_FIXTURES.enProceso({ claveAcceso })) } })

    const pendientes = harness.context.processRequest({ action: 'listarFacturasPendientesDePolling', serviceToken: SERVICE_TOKEN, environment: 'test' })
    expect(pendientes.data.map(f => f.ID)).not.toContain(facturaId)
  })
})

describe('aislamiento test/production a nivel de orquestación', () => {
  it('dos facturas distintas en el mismo ambiente obtienen secuenciales distintos (nunca duplicados) a través del flujo completo', async () => {
    const harness = seededHarness()
    const gasOptions = gasHarnessOptions(harness)
    const facturaA = crearYReservar(harness, 'idem-a')
    const facturaB = crearYReservar(harness, 'idem-b')
    await generarYFirmarFactura(facturaA, { environment: 'test', emisor: EMISOR, signingKeys: testSigningKeys(), gasOptions })
    await generarYFirmarFactura(facturaB, { environment: 'test', emisor: EMISOR, signingKeys: testSigningKeys(), gasOptions })
    const secA = facturaActual(harness, facturaA).Sequential
    const secB = facturaActual(harness, facturaB).Sequential
    expect(secA).not.toBe(secB)
  })
})
