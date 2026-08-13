import { describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import { createAppsScriptHarness } from './appsScriptHarness'

const FUTURE = '2099-01-01T00:00:00.000Z'
const SERVICE_TOKEN = 'servicio-fiscal-secreto-de-prueba'

function seededHarness() {
  const harness = createAppsScriptHarness()
  harness.seed('Sesiones', [
    { Token: 'admin-token', Username: 'admin.test', UserID: 'USR-A', Rol: 'admin', Nombre: 'Admin Test', Expira: FUTURE },
  ])
  harness.seed('Usuarios', [
    { ID: 'USR-A', Nombre: 'Admin Test', Username: 'admin.test', Rol: 'admin', Activo: true },
  ])
  harness.seed('AuditoriaFiscal', [])
  harness.seed('FacturasFiscales', [])
  harness.seed('FacturaItems', [])
  harness.seed('SecuenciaFiscal', [])
  harness.seed('ConfiguracionFiscal', [])
  harness.properties.set('FISCAL_SERVICE_TOKEN', SERVICE_TOKEN)
  return harness
}

function migrar(harness) {
  harness.properties.set('SRI_MIGRATION_CONFIRMATION', 'APPLY_SRI_MIGRATION_ONCE')
  return harness.context.processRequest({ action: 'migrarModuloFiscal', token: 'admin-token', confirmacion: 'APLICAR_MODULO_FISCAL' })
}

function crearYReservar(harness) {
  const draft = harness.context.processRequest({
    action: 'crearBorradorFactura',
    token: 'admin-token',
    environment: 'test',
    idempotencyKey: 'idem-orq-1',
    buyerIdentificationType: 'cedula',
    buyerIdentification: '0804655462',
    buyerName: 'Angel David Espinoza Ureta',
    items: [{ codigo: 'CAPACITACION', descripcion: 'Curso', cantidad: 1, precioUnitarioCents: 100, taxRateBasisPoints: 0, baseCents: 100, totalCents: 100 }],
    taxTotal: 0,
    grandTotal: 100,
  }).data
  harness.context.processRequest({ action: 'reservarSecuencialFiscal', token: 'admin-token', facturaId: draft.ID, establishment: '001', emissionPoint: '002' })
  return draft.ID
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function facturaAutorizadaPendienteEntrega(harness) {
  const facturaId = crearYReservar(harness)
  const xmlAutorizado = '<autorizacion><estado>AUTORIZADO</estado><comprobante><![CDATA[<factura id="comprobante">ok</factura>]]></comprobante></autorizacion>'
  ;['GENERATED', 'SIGNED', 'SUBMITTING', 'RECEIVED', 'PROCESSING', 'AUTHORIZED'].forEach(nuevoEstado => {
    const camposAdicionales = nuevoEstado === 'AUTHORIZED'
      ? {
          SriReceptionStatus: 'RECIBIDA',
          SriAuthorizationStatus: 'AUTORIZADO',
          AuthorizationNumber: '1308202601123456789001120010020000000011234567811',
          AuthorizationDate: '2026-08-13T10:00:00-05:00',
          XmlAuthorizedContent: xmlAutorizado,
          Sha256Authorized: sha256(xmlAutorizado),
        }
      : {}
    harness.context.processRequest({ action: 'transicionEstadoFactura', serviceToken: SERVICE_TOKEN, facturaId, nuevoEstado, camposAdicionales })
  })
  harness.context.processRequest({ action: 'transicionEstadoFactura', serviceToken: SERVICE_TOKEN, facturaId, nuevoEstado: 'DELIVERY_PENDING' })
  return { facturaId, xmlAutorizado }
}

describe('autenticación servidor-a-servidor (serviceToken)', () => {
  it('una acción en el allowlist acepta serviceToken válido sin token de usuario', () => {
    const harness = seededHarness()
    migrar(harness)
    const result = harness.context.processRequest({ action: 'getConfiguracionFiscal', serviceToken: SERVICE_TOKEN })
    expect(result.success).toBe(true)
  })

  it('rechaza un serviceToken incorrecto', () => {
    const harness = seededHarness()
    migrar(harness)
    const result = harness.context.processRequest({ action: 'getConfiguracionFiscal', serviceToken: 'token-equivocado' })
    expect(result.success).toBe(false)
  })

  it('rechaza cuando FISCAL_SERVICE_TOKEN no está configurado (property ausente)', () => {
    const harness = seededHarness()
    harness.properties.delete('FISCAL_SERVICE_TOKEN')
    migrar(harness)
    const result = harness.context.processRequest({ action: 'getConfiguracionFiscal', serviceToken: SERVICE_TOKEN })
    expect(result.success).toBe(false)
  })

  it('una acción FUERA del allowlist no acepta serviceToken como sustituto de sesión (p. ej. getUsuarios)', () => {
    const harness = seededHarness()
    const result = harness.context.processRequest({ action: 'getUsuarios', serviceToken: SERVICE_TOKEN })
    expect(result.success).toBe(false)
  })

  it('las acciones de servicio quedan auditadas como actor "fiscal-service", no como un usuario humano', () => {
    const harness = seededHarness()
    migrar(harness)
    const facturaId = crearYReservar(harness)
    harness.context.processRequest({ action: 'transicionEstadoFactura', serviceToken: SERVICE_TOKEN, facturaId, nuevoEstado: 'GENERATED' })
    const evento = harness.objects('AuditoriaFiscal').find(item => item.EstadoNuevo === 'GENERATED')
    expect(evento.Usuario).toBe('fiscal-service')
  })
})

describe('documentos fiscales autorizados: RIDE/XML y cierre de entrega', () => {
  it('persiste el RIDE en Drive privado, guarda solo referencia/hash y permite recuperarlo', () => {
    const harness = seededHarness()
    migrar(harness)
    const { facturaId } = facturaAutorizadaPendienteEntrega(harness)
    const pdfBytes = Buffer.from('%PDF-ride-fixture')
    const rideHash = sha256(pdfBytes)

    const stored = harness.context.processRequest({
      action: 'guardarRideFiscal',
      serviceToken: SERVICE_TOKEN,
      facturaId,
      ridePdfBase64: pdfBytes.toString('base64'),
      sha256Ride: rideHash,
      filename: 'RIDE_001-002-000000001.pdf',
    })

    expect(stored.success).toBe(true)
    expect(stored.data.rideReference).toMatch(/^drive:/)
    expect(stored.data.sha256Ride).toBe(rideHash)
    expect(harness.driveFiles.size).toBe(1)
    const factura = harness.context.processRequest({ action: 'getFacturaFiscalCompleta', serviceToken: SERVICE_TOKEN, facturaId }).data.factura
    expect(factura.RideReference).toMatch(/^drive:/)
    expect(factura.Sha256Ride).toBe(rideHash)
  })

  it('es idempotente si se reintenta guardar el mismo RIDE y no duplica archivos ni auditoria semantica', () => {
    const harness = seededHarness()
    migrar(harness)
    const { facturaId } = facturaAutorizadaPendienteEntrega(harness)
    const pdfBytes = Buffer.from('%PDF-ride-fixture')
    const request = {
      action: 'guardarRideFiscal',
      serviceToken: SERVICE_TOKEN,
      facturaId,
      ridePdfBase64: pdfBytes.toString('base64'),
      sha256Ride: sha256(pdfBytes),
      filename: 'RIDE_001-002-000000001.pdf',
    }

    const first = harness.context.processRequest(request)
    const second = harness.context.processRequest(request)

    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    expect(second.data.idempotent).toBe(true)
    expect(harness.driveFiles.size).toBe(1)
    expect(harness.objects('AuditoriaFiscal').filter(item => item.Accion === 'RIDE_STORED')).toHaveLength(1)
  })

  it('rechaza reemplazar un RIDE existente con una huella distinta', () => {
    const harness = seededHarness()
    migrar(harness)
    const { facturaId } = facturaAutorizadaPendienteEntrega(harness)
    const pdfBytes = Buffer.from('%PDF-ride-fixture')
    harness.context.processRequest({
      action: 'guardarRideFiscal',
      serviceToken: SERVICE_TOKEN,
      facturaId,
      ridePdfBase64: pdfBytes.toString('base64'),
      sha256Ride: sha256(pdfBytes),
      filename: 'RIDE.pdf',
    })

    const otherPdf = Buffer.from('%PDF-other')
    const replaced = harness.context.processRequest({
      action: 'guardarRideFiscal',
      serviceToken: SERVICE_TOKEN,
      facturaId,
      ridePdfBase64: otherPdf.toString('base64'),
      sha256Ride: sha256(otherPdf),
      filename: 'RIDE-v2.pdf',
    })

    expect(replaced.success).toBe(false)
    expect(harness.driveFiles.size).toBe(1)
    expect(harness.objects('AuditoriaFiscal').some(item => item.Accion === 'RIDE_STORE_REJECTED')).toBe(true)
  })

  it('recupera XML autorizado y RIDE validando sus hashes', () => {
    const harness = seededHarness()
    migrar(harness)
    const { facturaId, xmlAutorizado } = facturaAutorizadaPendienteEntrega(harness)
    const pdfBytes = Buffer.from('%PDF-ride-fixture')
    const rideHash = sha256(pdfBytes)
    harness.context.processRequest({
      action: 'guardarRideFiscal',
      serviceToken: SERVICE_TOKEN,
      facturaId,
      ridePdfBase64: pdfBytes.toString('base64'),
      sha256Ride: rideHash,
      filename: 'RIDE.pdf',
    })

    const ride = harness.context.processRequest({ action: 'getDocumentoFiscalParaDescarga', serviceToken: SERVICE_TOKEN, facturaId, tipo: 'RIDE' })
    const xml = harness.context.processRequest({ action: 'getDocumentoFiscalParaDescarga', serviceToken: SERVICE_TOKEN, facturaId, tipo: 'XML_AUTORIZADO' })

    expect(ride.success).toBe(true)
    expect(ride.data.sha256).toBe(rideHash)
    expect(Buffer.from(ride.data.contentBase64, 'base64').toString()).toBe('%PDF-ride-fixture')
    expect(xml.success).toBe(true)
    expect(xml.data.sha256).toBe(sha256(xmlAutorizado))
    expect(Buffer.from(xml.data.contentBase64, 'base64').toString()).toBe(xmlAutorizado)
  })

  it('cierra DELIVERY_PENDING a DELIVERED solo cuando XML y RIDE son recuperables, y luego es idempotente', () => {
    const harness = seededHarness()
    migrar(harness)
    const { facturaId } = facturaAutorizadaPendienteEntrega(harness)
    const blocked = harness.context.processRequest({ action: 'cerrarEntregaFiscal', serviceToken: SERVICE_TOKEN, facturaId })
    expect(blocked.success).toBe(false)

    const pdfBytes = Buffer.from('%PDF-ride-fixture')
    harness.context.processRequest({
      action: 'guardarRideFiscal',
      serviceToken: SERVICE_TOKEN,
      facturaId,
      ridePdfBase64: pdfBytes.toString('base64'),
      sha256Ride: sha256(pdfBytes),
      filename: 'RIDE.pdf',
    })

    const closed = harness.context.processRequest({ action: 'cerrarEntregaFiscal', serviceToken: SERVICE_TOKEN, facturaId })
    const repeated = harness.context.processRequest({ action: 'cerrarEntregaFiscal', serviceToken: SERVICE_TOKEN, facturaId })

    expect(closed.success).toBe(true)
    expect(closed.data.factura.Status).toBe('DELIVERED')
    expect(repeated.success).toBe(true)
    expect(repeated.data.idempotent).toBe(true)
    expect(harness.objects('AuditoriaFiscal').filter(item => item.Accion === 'FISCAL_DELIVERY_COMPLETED')).toHaveLength(1)
  })

  it('no permite guardar RIDE si no existe autorizacion SRI', () => {
    const harness = seededHarness()
    migrar(harness)
    const facturaId = crearYReservar(harness)
    const pdfBytes = Buffer.from('%PDF-ride-fixture')
    const result = harness.context.processRequest({
      action: 'guardarRideFiscal',
      serviceToken: SERVICE_TOKEN,
      facturaId,
      ridePdfBase64: pdfBytes.toString('base64'),
      sha256Ride: sha256(pdfBytes),
      filename: 'RIDE.pdf',
    })

    expect(result.success).toBe(false)
  })
})

describe('getFacturaFiscalCompleta', () => {
  it('devuelve la factura junto con sus ítems', () => {
    const harness = seededHarness()
    migrar(harness)
    const facturaId = crearYReservar(harness)
    const result = harness.context.processRequest({ action: 'getFacturaFiscalCompleta', serviceToken: SERVICE_TOKEN, facturaId })
    expect(result.success).toBe(true)
    expect(result.data.factura.ID).toBe(facturaId)
    expect(result.data.items).toHaveLength(1)
  })

  it('falla si la factura no existe', () => {
    const harness = seededHarness()
    migrar(harness)
    const result = harness.context.processRequest({ action: 'getFacturaFiscalCompleta', serviceToken: SERVICE_TOKEN, facturaId: 'NO-EXISTE' })
    expect(result.success).toBe(false)
  })
})

describe('listarFacturasPendientesDePolling', () => {
  it('incluye una factura RECEIVED/PROCESSING sin NextPollAt (nunca sondeada)', () => {
    const harness = seededHarness()
    migrar(harness)
    const facturaId = crearYReservar(harness)
    ;['GENERATED', 'SIGNED', 'SUBMITTING', 'RECEIVED'].forEach(nuevoEstado => {
      harness.context.processRequest({ action: 'transicionEstadoFactura', serviceToken: SERVICE_TOKEN, facturaId, nuevoEstado })
    })
    const result = harness.context.processRequest({ action: 'listarFacturasPendientesDePolling', serviceToken: SERVICE_TOKEN, environment: 'test' })
    expect(result.data.map(item => item.ID)).toContain(facturaId)
  })

  it('excluye una factura cuyo NextPollAt todavía no llega', () => {
    const harness = seededHarness()
    migrar(harness)
    const facturaId = crearYReservar(harness)
    ;['GENERATED', 'SIGNED', 'SUBMITTING', 'RECEIVED', 'PROCESSING'].forEach(nuevoEstado => {
      harness.context.processRequest({ action: 'transicionEstadoFactura', serviceToken: SERVICE_TOKEN, facturaId, nuevoEstado })
    })
    const futuro = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    harness.context.processRequest({ action: 'transicionEstadoFactura', serviceToken: SERVICE_TOKEN, facturaId, nuevoEstado: 'PROCESSING', camposAdicionales: { NextPollAt: futuro } })
    const result = harness.context.processRequest({ action: 'listarFacturasPendientesDePolling', serviceToken: SERVICE_TOKEN, environment: 'test' })
    expect(result.data.map(item => item.ID)).not.toContain(facturaId)
  })

  it('nunca mezcla ambientes: una factura test no aparece al pedir production', () => {
    const harness = seededHarness()
    migrar(harness)
    const facturaId = crearYReservar(harness)
    ;['GENERATED', 'SIGNED', 'SUBMITTING', 'RECEIVED'].forEach(nuevoEstado => {
      harness.context.processRequest({ action: 'transicionEstadoFactura', serviceToken: SERVICE_TOKEN, facturaId, nuevoEstado })
    })
    const result = harness.context.processRequest({ action: 'listarFacturasPendientesDePolling', serviceToken: SERVICE_TOKEN, environment: 'production' })
    expect(result.data.map(item => item.ID)).not.toContain(facturaId)
  })

  it('excluye facturas ya AUTHORIZED/NOT_AUTHORIZED (ya resueltas, no hay nada que sondear)', () => {
    const harness = seededHarness()
    migrar(harness)
    const facturaId = crearYReservar(harness)
    ;['GENERATED', 'SIGNED', 'SUBMITTING', 'RECEIVED', 'PROCESSING', 'AUTHORIZED'].forEach(nuevoEstado => {
      harness.context.processRequest({ action: 'transicionEstadoFactura', serviceToken: SERVICE_TOKEN, facturaId, nuevoEstado })
    })
    const result = harness.context.processRequest({ action: 'listarFacturasPendientesDePolling', serviceToken: SERVICE_TOKEN, environment: 'test' })
    expect(result.data.map(item => item.ID)).not.toContain(facturaId)
  })
})

describe('SUBMITTING como exclusión mutua para el envío a Recepción', () => {
  function facturaFirmada(harness) {
    const facturaId = crearYReservar(harness)
    ;['GENERATED', 'SIGNED'].forEach(nuevoEstado => {
      harness.context.processRequest({ action: 'transicionEstadoFactura', serviceToken: SERVICE_TOKEN, facturaId, nuevoEstado })
    })
    return facturaId
  }

  it('el primer intento de reclamar SUBMITTING desde SIGNED tiene éxito', () => {
    const harness = seededHarness()
    migrar(harness)
    const facturaId = facturaFirmada(harness)
    const result = harness.context.processRequest({ action: 'transicionEstadoFactura', serviceToken: SERVICE_TOKEN, facturaId, nuevoEstado: 'SUBMITTING' })
    expect(result.success).toBe(true)
  })

  it('un segundo intento de reclamar SUBMITTING sobre la misma factura ya reclamada es rechazado (simula concurrencia: solo uno gana la carrera)', () => {
    const harness = seededHarness()
    migrar(harness)
    const facturaId = facturaFirmada(harness)
    const primero = harness.context.processRequest({ action: 'transicionEstadoFactura', serviceToken: SERVICE_TOKEN, facturaId, nuevoEstado: 'SUBMITTING' })
    const segundo = harness.context.processRequest({ action: 'transicionEstadoFactura', serviceToken: SERVICE_TOKEN, facturaId, nuevoEstado: 'SUBMITTING' })
    expect(primero.success).toBe(true)
    expect(segundo.success).toBe(false)
  })

  it('tras un fallo transitorio se libera el claim (SUBMITTING -> SIGNED) y permite reclamar de nuevo', () => {
    const harness = seededHarness()
    migrar(harness)
    const facturaId = facturaFirmada(harness)
    harness.context.processRequest({ action: 'transicionEstadoFactura', serviceToken: SERVICE_TOKEN, facturaId, nuevoEstado: 'SUBMITTING' })
    const liberado = harness.context.processRequest({ action: 'transicionEstadoFactura', serviceToken: SERVICE_TOKEN, facturaId, nuevoEstado: 'SIGNED' })
    expect(liberado.success).toBe(true)
    const reclamoOtraVez = harness.context.processRequest({ action: 'transicionEstadoFactura', serviceToken: SERVICE_TOKEN, facturaId, nuevoEstado: 'SUBMITTING' })
    expect(reclamoOtraVez.success).toBe(true)
  })
})

describe('reanudarPollingFactura — reactivación explícita por un administrador', () => {
  function facturaSuspendida(harness) {
    const facturaId = crearYReservar(harness)
    ;['GENERATED', 'SIGNED', 'SUBMITTING', 'RECEIVED', 'PROCESSING'].forEach(nuevoEstado => {
      harness.context.processRequest({ action: 'transicionEstadoFactura', serviceToken: SERVICE_TOKEN, facturaId, nuevoEstado })
    })
    harness.context.processRequest({
      action: 'transicionEstadoFactura', serviceToken: SERVICE_TOKEN, facturaId, nuevoEstado: 'PROCESSING',
      camposAdicionales: { ReviewFlag: 'REQUIRES_REVIEW', ReviewReason: 'Excede reintentos automáticos (fixture de prueba).' },
    })
    return facturaId
  }

  it('exige sesión de usuario real: un serviceToken NO puede reanudar (no está en el allowlist de servicio)', () => {
    const harness = seededHarness()
    migrar(harness)
    const facturaId = facturaSuspendida(harness)
    const result = harness.context.processRequest({ action: 'reanudarPollingFactura', serviceToken: SERVICE_TOKEN, facturaId, motivo: 'Reintentado manualmente tras revisión.' })
    expect(result.success).toBe(false)
  })

  it('exige un motivo de al menos 5 caracteres', () => {
    const harness = seededHarness()
    migrar(harness)
    const facturaId = facturaSuspendida(harness)
    const result = harness.context.processRequest({ action: 'reanudarPollingFactura', token: 'admin-token', facturaId, motivo: 'ok' })
    expect(result.success).toBe(false)
  })

  it('limpia ReviewFlag/ReviewReason, resetea RetryCount y agenda un intento inmediato, sin tocar el Status fiscal', () => {
    const harness = seededHarness()
    migrar(harness)
    const facturaId = facturaSuspendida(harness)

    const result = harness.context.processRequest({ action: 'reanudarPollingFactura', token: 'admin-token', facturaId, motivo: 'Se corrigió la causa raíz, reintentar ahora.' })

    expect(result.success).toBe(true)
    expect(result.data.ReviewFlag).toBe('')
    expect(result.data.Status).toBe('PROCESSING') // el estado del SRI no cambia, solo la bandera operativa
    expect(Number(result.data.RetryCount)).toBe(0)
    expect(harness.objects('AuditoriaFiscal').some(item => item.Accion === 'FACTURA_POLLING_RESUMED')).toBe(true)
  })

  it('la factura reanudada vuelve a aparecer en listarFacturasPendientesDePolling', () => {
    const harness = seededHarness()
    migrar(harness)
    const facturaId = facturaSuspendida(harness)
    harness.context.processRequest({ action: 'reanudarPollingFactura', token: 'admin-token', facturaId, motivo: 'Reintentar tras revisión manual.' })

    const pendientes = harness.context.processRequest({ action: 'listarFacturasPendientesDePolling', serviceToken: SERVICE_TOKEN, environment: 'test' })
    expect(pendientes.data.map(f => f.ID)).toContain(facturaId)
  })

  it('rechaza reanudar una factura que no está marcada para revisión', () => {
    const harness = seededHarness()
    migrar(harness)
    const facturaId = crearYReservar(harness)
    const result = harness.context.processRequest({ action: 'reanudarPollingFactura', token: 'admin-token', facturaId, motivo: 'Intento sin que esté suspendida.' })
    expect(result.success).toBe(false)
  })
})
