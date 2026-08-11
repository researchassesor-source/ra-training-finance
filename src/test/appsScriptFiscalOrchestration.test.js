import { describe, expect, it } from 'vitest'
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
