import { describe, expect, it } from 'vitest'
import { createAppsScriptHarness } from './appsScriptHarness'

const FUTURE = '2099-01-01T00:00:00.000Z'

function seededHarness() {
  const harness = createAppsScriptHarness()
  harness.seed('Sesiones', [
    { Token: 'admin-token', Username: 'admin.test', UserID: 'USR-A', Rol: 'admin', Nombre: 'Admin Test', Expira: FUTURE },
    { Token: 'seller-token', Username: 'seller.test', UserID: 'USR-V', Rol: 'vendedor', Nombre: 'Seller Test', Expira: FUTURE },
  ])
  harness.seed('Usuarios', [
    { ID: 'USR-A', Nombre: 'Admin Test', Username: 'admin.test', Rol: 'admin', Activo: true },
    { ID: 'USR-V', Nombre: 'Seller Test', Username: 'seller.test', Rol: 'vendedor', Activo: true },
  ])
  harness.seed('AuditoriaFiscal', [])
  harness.seed('FacturasFiscales', [])
  harness.seed('FacturaItems', [])
  harness.seed('SecuenciaFiscal', [])
  harness.seed('ConfiguracionFiscal', [])
  return harness
}

function migrar(harness) {
  harness.properties.set('SRI_MIGRATION_CONFIRMATION', 'APPLY_SRI_MIGRATION_ONCE')
  return harness.context.processRequest({
    action: 'migrarModuloFiscal',
    token: 'admin-token',
    confirmacion: 'APLICAR_MODULO_FISCAL',
  })
}

const ITEM_CAPACITACION = {
  codigo: 'CAPACITACION',
  descripcion: 'Curso de prueba',
  cantidad: 1,
  precioUnitarioCents: 100,
  taxRateBasisPoints: 0,
  baseCents: 100,
  totalCents: 100,
}

function draftParams(overrides) {
  return {
    action: 'crearBorradorFactura',
    token: 'admin-token',
    environment: 'test',
    idempotencyKey: 'idem-1',
    buyerIdentificationType: 'cedula',
    buyerIdentification: '0804655462',
    buyerName: 'Angel David Espinoza Ureta',
    buyerEmail: 'david005espinoza@gmail.com',
    items: [ITEM_CAPACITACION],
    taxTotal: 0,
    grandTotal: 100,
    ...overrides,
  }
}

describe('migración del módulo fiscal', () => {
  it('bloquea sin el parámetro de confirmación', () => {
    const harness = seededHarness()
    harness.properties.set('SRI_MIGRATION_CONFIRMATION', 'APPLY_SRI_MIGRATION_ONCE')
    const result = harness.context.processRequest({ action: 'migrarModuloFiscal', token: 'admin-token' })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/bloqueada/i)
  })

  it('bloquea sin la Script Property, aunque el parámetro esté presente', () => {
    const harness = seededHarness()
    const result = harness.context.processRequest({ action: 'migrarModuloFiscal', token: 'admin-token', confirmacion: 'APLICAR_MODULO_FISCAL' })
    expect(result.success).toBe(false)
  })

  it('rechaza a un usuario no admin', () => {
    const harness = seededHarness()
    harness.properties.set('SRI_MIGRATION_CONFIRMATION', 'APPLY_SRI_MIGRATION_ONCE')
    const result = harness.context.processRequest({ action: 'migrarModuloFiscal', token: 'seller-token', confirmacion: 'APLICAR_MODULO_FISCAL' })
    expect(result.success).toBe(false)
  })

  it('con ambas confirmaciones: crea hojas, siembra catálogo, audita y borra la property al terminar', () => {
    const harness = seededHarness()
    const result = migrar(harness)
    expect(result.success).toBe(true)
    expect(result.data.catalogoSembrado).toBe(true)

    const catalogo = harness.objects('ConfiguracionFiscal')
    expect(catalogo.map(item => item.CodigoInterno).sort()).toEqual(['CAPACITACION', 'CAPACITACION_CERTIFICADO', 'PRUEBA_TECNICA_SRI'])
    expect(catalogo.every(item => Number(item.TaxRateBasisPoints) === 0)).toBe(true)

    expect(harness.objects('AuditoriaFiscal').map(item => item.Accion)).toContain('FISCAL_MODULE_MIGRATED')
    expect(harness.properties.get('SRI_MIGRATION_CONFIRMATION')).toBeUndefined()
  })

  it('es idempotente: correr dos veces no duplica el catálogo', () => {
    const harness = seededHarness()
    migrar(harness)
    harness.properties.set('SRI_MIGRATION_CONFIRMATION', 'APPLY_SRI_MIGRATION_ONCE')
    const second = migrar(harness)
    expect(second.data.catalogoSembrado).toBe(false)
    expect(harness.objects('ConfiguracionFiscal')).toHaveLength(3)
  })
})

describe('catálogo fiscal', () => {
  it('getConfiguracionFiscal devuelve solo ítems activos', () => {
    const harness = seededHarness()
    migrar(harness)
    const result = harness.context.processRequest({ action: 'getConfiguracionFiscal', token: 'admin-token' })
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(3)
    expect(result.data.map(item => item.CodigoInterno).sort()).toEqual(['CAPACITACION', 'CAPACITACION_CERTIFICADO', 'PRUEBA_TECNICA_SRI'])
  })

  it('el catálogo sembrado nace con ValidacionTributaria=pendiente (IVA 0% no confirmado aún)', () => {
    const harness = seededHarness()
    migrar(harness)
    const result = harness.context.processRequest({ action: 'getConfiguracionFiscal', token: 'admin-token' })
    expect(result.data.every(item => item.ValidacionTributaria === 'pendiente')).toBe(true)
  })

  it('solo PRUEBA_TECNICA_SRI nace marcado TestOnly=true', () => {
    const harness = seededHarness()
    migrar(harness)
    const result = harness.context.processRequest({ action: 'getConfiguracionFiscal', token: 'admin-token' })
    const testOnly = result.data.filter(item => item.TestOnly === true)
    expect(testOnly.map(item => item.CodigoInterno)).toEqual(['PRUEBA_TECNICA_SRI'])
  })
})

describe('catálogo TEST_ONLY — bloqueo absoluto en producción', () => {
  const ITEM_PRUEBA = { codigo: 'PRUEBA_TECNICA_SRI', descripcion: 'Prueba técnica', cantidad: 1, precioUnitarioCents: 100, taxRateBasisPoints: 0, baseCents: 100, totalCents: 100 }

  it('un ítem TestOnly se puede usar libremente en test', () => {
    const harness = seededHarness()
    migrar(harness)
    const result = harness.context.processRequest(draftParams({ environment: 'test', items: [ITEM_PRUEBA], idempotencyKey: 'idem-testonly-1' }))
    expect(result.success).toBe(true)
  })

  it('un ítem TestOnly se bloquea en production incluso si ValidacionTributaria estuviera confirmada', () => {
    const harness = seededHarness()
    migrar(harness)
    harness.context.processRequest({ action: 'confirmarValidacionTributariaFiscal', token: 'admin-token', codigoInterno: 'PRUEBA_TECNICA_SRI', motivo: 'Intento de confirmar de todas formas.' })
    const result = harness.context.processRequest(draftParams({ environment: 'production', items: [ITEM_PRUEBA], idempotencyKey: 'idem-testonly-2' }))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/TEST_ONLY/)
  })
})

describe('validación tributaria del catálogo (gate de producción)', () => {
  it('bloquea un borrador en environment=production mientras el código esté pendiente', () => {
    const harness = seededHarness()
    migrar(harness)
    const result = harness.context.processRequest(draftParams({ environment: 'production', idempotencyKey: 'idem-prod-1' }))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/tributario/i)
  })

  it('permite el mismo borrador en environment=test aunque esté pendiente (sin efecto tributario real)', () => {
    const harness = seededHarness()
    migrar(harness)
    const result = harness.context.processRequest(draftParams({ environment: 'test', idempotencyKey: 'idem-test-1' }))
    expect(result.success).toBe(true)
  })

  it('confirmarValidacionTributariaFiscal exige admin y un motivo de al menos 5 caracteres', () => {
    const harness = seededHarness()
    migrar(harness)
    const sinMotivo = harness.context.processRequest({ action: 'confirmarValidacionTributariaFiscal', token: 'admin-token', codigoInterno: 'CAPACITACION', motivo: 'ok' })
    expect(sinMotivo.success).toBe(false)
    const noAdmin = harness.context.processRequest({ action: 'confirmarValidacionTributariaFiscal', token: 'seller-token', codigoInterno: 'CAPACITACION', motivo: 'Confirmado por contador externo' })
    expect(noAdmin.success).toBe(false)
  })

  it('una vez confirmado el código, el borrador de producción se acepta', () => {
    const harness = seededHarness()
    migrar(harness)
    const confirm = harness.context.processRequest({
      action: 'confirmarValidacionTributariaFiscal', token: 'admin-token',
      codigoInterno: 'CAPACITACION', motivo: 'Confirmado por contador externo tras revisión de RUC y actividad económica.',
    })
    expect(confirm.success).toBe(true)
    expect(confirm.data.validacionTributaria).toBe('confirmado')
    expect(harness.objects('AuditoriaFiscal').some(item => item.Accion === 'TAX_VALIDATION_CONFIRM' && item.EstadoNuevo === 'confirmado')).toBe(true)

    const result = harness.context.processRequest(draftParams({ environment: 'production', idempotencyKey: 'idem-prod-2' }))
    expect(result.success).toBe(true)
  })

  it('se puede revertir una confirmación a pendiente (confirmado: false), y vuelve a bloquear producción', () => {
    const harness = seededHarness()
    migrar(harness)
    harness.context.processRequest({ action: 'confirmarValidacionTributariaFiscal', token: 'admin-token', codigoInterno: 'CAPACITACION', motivo: 'Confirmación inicial de prueba.' })
    const revert = harness.context.processRequest({
      action: 'confirmarValidacionTributariaFiscal', token: 'admin-token',
      codigoInterno: 'CAPACITACION', motivo: 'Se detectó que la actividad no calificaba, se revierte.', confirmado: false,
    })
    expect(revert.data.validacionTributaria).toBe('pendiente')
    const result = harness.context.processRequest(draftParams({ environment: 'production', idempotencyKey: 'idem-prod-3' }))
    expect(result.success).toBe(false)
  })
})

describe('borrador de factura', () => {
  it('rechaza un código que no existe en el catálogo', () => {
    const harness = seededHarness()
    migrar(harness)
    const result = harness.context.processRequest(draftParams({
      items: [{ ...ITEM_CAPACITACION, codigo: 'CONSULTORIA' }],
    }))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/catálogo/i)
  })

  it('rechaza una tarifa de impuesto que no coincide con el catálogo', () => {
    const harness = seededHarness()
    migrar(harness)
    const result = harness.context.processRequest(draftParams({
      items: [{ ...ITEM_CAPACITACION, taxRateBasisPoints: 1500 }],
    }))
    expect(result.success).toBe(false)
  })

  it('rechaza un grandTotal que no cuadra con subtotal + impuesto', () => {
    const harness = seededHarness()
    migrar(harness)
    const result = harness.context.processRequest(draftParams({ grandTotal: 999 }))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/grandTotal/)
  })

  it('crea un borrador válido en estado DRAFT y audita la creación', () => {
    const harness = seededHarness()
    migrar(harness)
    const result = harness.context.processRequest(draftParams())
    expect(result.success).toBe(true)
    expect(result.data.Status).toBe('DRAFT')
    expect(result.data.GrandTotal).toBe(100)
    expect(harness.objects('FacturaItems')).toHaveLength(1)
    expect(harness.objects('AuditoriaFiscal').map(item => item.Accion)).toContain('FACTURA_DRAFT_CREATED')
  })

  it('es idempotente ante la misma idempotencyKey: no crea un segundo borrador', () => {
    const harness = seededHarness()
    migrar(harness)
    const first = harness.context.processRequest(draftParams())
    const second = harness.context.processRequest(draftParams())
    expect(second.idempotent).toBe(true)
    expect(second.data.ID).toBe(first.data.ID)
    expect(harness.objects('FacturasFiscales')).toHaveLength(1)
  })

  it('rechaza a un usuario no admin y lo audita como rechazado', () => {
    const harness = seededHarness()
    migrar(harness)
    const result = harness.context.processRequest({ ...draftParams(), token: 'seller-token' })
    expect(result.success).toBe(false)
    expect(harness.objects('AuditoriaFiscal').some(item => item.Accion === 'FACTURA_DRAFT_CREATE' && item.Resultado === 'rechazado')).toBe(true)
  })
})

describe('reserva atómica de secuencial', () => {
  function crearBorrador(harness, idempotencyKey) {
    return harness.context.processRequest(draftParams({ idempotencyKey })).data
  }

  it('asigna 000000001 en el primer uso de la serie', () => {
    const harness = seededHarness()
    migrar(harness)
    const factura = crearBorrador(harness, 'idem-seq-1')
    const result = harness.context.processRequest({
      action: 'reservarSecuencialFiscal', token: 'admin-token',
      facturaId: factura.ID, establishment: '001', emissionPoint: '002',
    })
    expect(result.success).toBe(true)
    expect(result.data.sequential).toBe('000000001')
    expect(harness.objects('FacturasFiscales').find(item => item.ID === factura.ID)).toMatchObject({ Status: 'SEQUENCE_RESERVED', Sequential: '000000001', DocumentNumber: '001-002-000000001' })
  })

  it('incrementa el secuencial en usos sucesivos de la misma serie', () => {
    const harness = seededHarness()
    migrar(harness)
    const facturaA = crearBorrador(harness, 'idem-seq-a')
    harness.context.processRequest({ action: 'reservarSecuencialFiscal', token: 'admin-token', facturaId: facturaA.ID, establishment: '001', emissionPoint: '002' })

    const facturaB = crearBorrador(harness, 'idem-seq-b')
    const second = harness.context.processRequest({ action: 'reservarSecuencialFiscal', token: 'admin-token', facturaId: facturaB.ID, establishment: '001', emissionPoint: '002' })
    expect(second.data.sequential).toBe('000000002')
  })

  it('detiene y no asigna automáticamente si ya existen facturas en esa serie sin contador (conflicto)', () => {
    const harness = seededHarness()
    migrar(harness)
    // Simula una factura preexistente en 001-002 que no pasó por el contador (p.ej. dato heredado).
    harness.seed('FacturasFiscales', [{ ID: 'FACT-LEGADO', Environment: 'test', Status: 'AUTHORIZED', Establishment: '001', EmissionPoint: '002' }])

    const factura = crearBorrador(harness, 'idem-seq-conflict')
    const result = harness.context.processRequest({ action: 'reservarSecuencialFiscal', token: 'admin-token', facturaId: factura.ID, establishment: '001', emissionPoint: '002' })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/conflicto/i)
  })

  it('rechaza reservar sobre una factura que no está en DRAFT', () => {
    const harness = seededHarness()
    migrar(harness)
    const factura = crearBorrador(harness, 'idem-seq-double')
    harness.context.processRequest({ action: 'reservarSecuencialFiscal', token: 'admin-token', facturaId: factura.ID, establishment: '001', emissionPoint: '002' })
    const second = harness.context.processRequest({ action: 'reservarSecuencialFiscal', token: 'admin-token', facturaId: factura.ID, establishment: '001', emissionPoint: '002' })
    expect(second.success).toBe(false)
    expect(second.error).toMatch(/DRAFT/)
  })
})

describe('transición de estados de factura', () => {
  function facturaReservada(harness) {
    const factura = harness.context.processRequest(draftParams({ idempotencyKey: 'idem-trans' })).data
    harness.context.processRequest({ action: 'reservarSecuencialFiscal', token: 'admin-token', facturaId: factura.ID, establishment: '001', emissionPoint: '002' })
    return factura.ID
  }

  it('permite una transición válida y la audita', () => {
    const harness = seededHarness()
    migrar(harness)
    const facturaId = facturaReservada(harness)
    const result = harness.context.processRequest({ action: 'transicionEstadoFactura', token: 'admin-token', facturaId, nuevoEstado: 'GENERATED' })
    expect(result.success).toBe(true)
    expect(result.data.Status).toBe('GENERATED')
    expect(harness.objects('AuditoriaFiscal').some(item => item.Accion === 'FACTURA_STATE_TRANSITION' && item.EstadoNuevo === 'GENERATED')).toBe(true)
  })

  it('rechaza una transición no permitida y la audita como rechazada', () => {
    const harness = seededHarness()
    migrar(harness)
    const facturaId = facturaReservada(harness)
    const result = harness.context.processRequest({ action: 'transicionEstadoFactura', token: 'admin-token', facturaId, nuevoEstado: 'AUTHORIZED' })
    expect(result.success).toBe(false)
    expect(harness.objects('AuditoriaFiscal').some(item => item.Resultado === 'rechazado' && item.EstadoNuevo === 'AUTHORIZED')).toBe(true)
  })

  it('una factura AUTHORIZED es inmutable salvo hacia DELIVERY_PENDING', () => {
    const harness = seededHarness()
    migrar(harness)
    const facturaId = facturaReservada(harness)
    ;['GENERATED', 'SIGNED', 'SUBMITTING', 'RECEIVED', 'PROCESSING', 'AUTHORIZED'].forEach(nuevoEstado => {
      const step = harness.context.processRequest({ action: 'transicionEstadoFactura', token: 'admin-token', facturaId, nuevoEstado })
      expect(step.success).toBe(true)
    })
    const blocked = harness.context.processRequest({ action: 'transicionEstadoFactura', token: 'admin-token', facturaId, nuevoEstado: 'GENERATED' })
    expect(blocked.success).toBe(false)
    const allowed = harness.context.processRequest({ action: 'transicionEstadoFactura', token: 'admin-token', facturaId, nuevoEstado: 'DELIVERY_PENDING' })
    expect(allowed.success).toBe(true)
  })
})

describe('verificación de conflicto de serie', () => {
  it('no reporta conflicto sobre una serie sin uso previo', () => {
    const harness = seededHarness()
    migrar(harness)
    const result = harness.context.processRequest({ action: 'verificarConflictoSerieFiscal', token: 'admin-token', establishment: '001', emissionPoint: '002' })
    expect(result.data.conflict).toBe(false)
  })

  it('reporta conflicto si ya hay una factura en esa serie', () => {
    const harness = seededHarness()
    migrar(harness)
    harness.seed('FacturasFiscales', [{ ID: 'FACT-X', Environment: 'production', Status: 'AUTHORIZED', Establishment: '001', EmissionPoint: '002' }])
    const result = harness.context.processRequest({ action: 'verificarConflictoSerieFiscal', token: 'admin-token', establishment: '001', emissionPoint: '002' })
    expect(result.data.conflict).toBe(true)
  })
})
