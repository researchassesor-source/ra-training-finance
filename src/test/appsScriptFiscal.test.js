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
  sriTaxCode: '2:0',
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
    paymentMethodInternal: 'Transferencia',
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
    expect(catalogo.map(item => item.CodigoInterno).sort()).toEqual(['CAPACITACION', 'CAPACITACION_CERTIFICADO', 'CAPACITACION_RA', 'PRUEBA_TECNICA_SRI'])
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
    expect(harness.objects('ConfiguracionFiscal')).toHaveLength(4)
  })


  it('migrarCatalogoFiscalV2 actualiza solo el catalogo v1 persistido sin tocar facturas', () => {
    const harness = seededHarness()
    harness.seed('ConfiguracionFiscal', [
      { ID: 'FCFG-1', CodigoInterno: 'CAPACITACION', Descripcion: 'Capacitacion', TaxRateBasisPoints: 0, SriTaxCode: '', Activo: true, Version: 1, ValidacionTributaria: 'pendiente', TestOnly: false },
      { ID: 'FCFG-2', CodigoInterno: 'CAPACITACION_CERTIFICADO', Descripcion: 'Capacitacion con certificado', TaxRateBasisPoints: 0, SriTaxCode: '', Activo: true, Version: 1, ValidacionTributaria: 'pendiente', TestOnly: false },
      { ID: 'FCFG-3', CodigoInterno: 'PRUEBA_TECNICA_SRI', Descripcion: 'Prueba', TaxRateBasisPoints: 0, SriTaxCode: '', Activo: true, Version: 1, ValidacionTributaria: 'pendiente', TestOnly: true },
    ])
    harness.seed('FacturasFiscales', [{ ID: 'FACT_1786427014475_WZ5MR', Status: 'DELIVERED', AccessKey: 'clave-historica', Sequential: '000000001', XmlAuthorizedReference: 'xml-ref', RideReference: 'ride-ref', Sha256Authorized: 'xml-sha', Sha256Ride: 'ride-sha' }])

    const result = harness.context.processRequest({ action: 'migrarCatalogoFiscalV2', token: 'admin-token', confirmacion: 'APLICAR_CATALOGO_FISCAL_V2' })

    expect(result.success).toBe(true)
    const cursos = harness.objects('ConfiguracionFiscal').filter(item => ['CAPACITACION', 'CAPACITACION_CERTIFICADO'].includes(item.CodigoInterno))
    expect(cursos.every(item => item.SriTaxCode === '2:0')).toBe(true)
    expect(cursos.every(item => Number(item.Version) === 2)).toBe(true)
    expect(cursos.every(item => item.ValidacionTributaria === 'confirmado')).toBe(true)
    expect(harness.objects('FacturasFiscales')[0]).toMatchObject({ ID: 'FACT_1786427014475_WZ5MR', Status: 'DELIVERED', AccessKey: 'clave-historica', Sequential: '000000001', XmlAuthorizedReference: 'xml-ref', RideReference: 'ride-ref' })
    expect(harness.objects('AuditoriaFiscal').map(item => item.Accion)).toContain('FISCAL_CATALOG_V2_MIGRATED')
  })

  it('migrarCatalogoFiscalV2 es idempotente y exige admin + confirmacion propia', () => {
    const harness = seededHarness()
    migrar(harness)
    const sinConfirmacion = harness.context.processRequest({ action: 'migrarCatalogoFiscalV2', token: 'admin-token' })
    expect(sinConfirmacion.success).toBe(false)
    const vendedor = harness.context.processRequest({ action: 'migrarCatalogoFiscalV2', token: 'seller-token', confirmacion: 'APLICAR_CATALOGO_FISCAL_V2' })
    expect(vendedor.success).toBe(false)

    const first = harness.context.processRequest({ action: 'migrarCatalogoFiscalV2', token: 'admin-token', confirmacion: 'APLICAR_CATALOGO_FISCAL_V2' })
    const second = harness.context.processRequest({ action: 'migrarCatalogoFiscalV2', token: 'admin-token', confirmacion: 'APLICAR_CATALOGO_FISCAL_V2' })
    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    expect(second.data.cambiosAplicados).toBe(0)
    expect(harness.objects('ConfiguracionFiscal')).toHaveLength(4)
  })
})

describe('catálogo fiscal', () => {
  it('getConfiguracionFiscal devuelve solo ítems activos', () => {
    const harness = seededHarness()
    migrar(harness)
    const result = harness.context.processRequest({ action: 'getConfiguracionFiscal', token: 'admin-token' })
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(4)
    expect(result.data.map(item => item.CodigoInterno).sort()).toEqual(['CAPACITACION', 'CAPACITACION_CERTIFICADO', 'CAPACITACION_RA', 'PRUEBA_TECNICA_SRI'])
  })

  it('los cursos R.A. Training avalados por ITSAL nacen confirmados con IVA 0% por producto', () => {
    const harness = seededHarness()
    migrar(harness)
    const result = harness.context.processRequest({ action: 'getConfiguracionFiscal', token: 'admin-token' })
    const cursos = result.data.filter(item => ['CAPACITACION', 'CAPACITACION_CERTIFICADO'].includes(item.CodigoInterno))
    expect(cursos).toHaveLength(2)
    expect(cursos.every(item => item.ValidacionTributaria === 'confirmado')).toBe(true)
    expect(cursos.every(item => item.SriTaxCode === '2:0')).toBe(true)
    expect(cursos.every(item => Number(item.TaxRateBasisPoints) === 0)).toBe(true)
    const prueba = result.data.find(item => item.CodigoInterno === 'PRUEBA_TECNICA_SRI')
    expect(prueba.ValidacionTributaria).toBe('pendiente')
  })

  it('solo PRUEBA_TECNICA_SRI nace marcado TestOnly=true', () => {
    const harness = seededHarness()
    migrar(harness)
    const result = harness.context.processRequest({ action: 'getConfiguracionFiscal', token: 'admin-token' })
    const testOnly = result.data.filter(item => item.TestOnly === true)
    expect(testOnly.map(item => item.CodigoInterno)).toEqual(['PRUEBA_TECNICA_SRI'])
  })
})

describe('catálogo fiscal — CAPACITACION_RA (curso R.A. Training sin aval externo)', () => {
  it('23. nace confirmado con IVA 0% y SriTaxCode 2:0 (mismo tratamiento tributario que CAPACITACION, código separado)', () => {
    const harness = seededHarness()
    migrar(harness)
    const ra = harness.objects('ConfiguracionFiscal').find(item => item.CodigoInterno === 'CAPACITACION_RA')
    expect(ra).toBeTruthy()
    expect(Number(ra.TaxRateBasisPoints)).toBe(0)
    expect(ra.SriTaxCode).toBe('2:0')
    expect(ra.ValidacionTributaria).toBe('confirmado')
    expect(ra.TestOnly).toBe(false)
  })

  it('24. CAPACITACION original sigue existiendo, sin renombrar ni eliminar', () => {
    const harness = seededHarness()
    migrar(harness)
    const capacitacion = harness.objects('ConfiguracionFiscal').find(item => item.CodigoInterno === 'CAPACITACION')
    expect(capacitacion).toBeTruthy()
    expect(capacitacion.Descripcion).toBe('Curso de formacion avalado por ITSAL')
  })

  it('25. la migración es idempotente: una segunda ejecución no duplica CAPACITACION_RA', () => {
    const harness = seededHarness()
    migrar(harness)
    harness.properties.set('SRI_MIGRATION_CONFIRMATION', 'APPLY_SRI_MIGRATION_ONCE')
    const second = migrar(harness)
    expect(second.data.catalogoSembrado).toBe(false)
    const coincidencias = harness.objects('ConfiguracionFiscal').filter(item => item.CodigoInterno === 'CAPACITACION_RA')
    expect(coincidencias).toHaveLength(1)
  })

  it('migrarCatalogoFiscalV2 puede sembrar CAPACITACION_RA de forma aditiva sin tocar CAPACITACION/CAPACITACION_CERTIFICADO/PRUEBA_TECNICA_SRI ni facturas históricas (26)', () => {
    const harness = seededHarness()
    harness.seed('ConfiguracionFiscal', [
      { ID: 'FCFG-1', CodigoInterno: 'CAPACITACION', Descripcion: 'Curso de formacion avalado por ITSAL', TaxRateBasisPoints: 0, SriTaxCode: '2:0', Activo: true, Version: 2, ValidacionTributaria: 'confirmado', TestOnly: false },
      { ID: 'FCFG-2', CodigoInterno: 'CAPACITACION_CERTIFICADO', Descripcion: 'Curso de formacion avalado por ITSAL con certificado incluido', TaxRateBasisPoints: 0, SriTaxCode: '2:0', Activo: true, Version: 2, ValidacionTributaria: 'confirmado', TestOnly: false },
      { ID: 'FCFG-3', CodigoInterno: 'PRUEBA_TECNICA_SRI', Descripcion: 'Prueba tecnica', TaxRateBasisPoints: 0, SriTaxCode: '2:0', Activo: true, Version: 2, ValidacionTributaria: 'pendiente', TestOnly: true },
    ])
    // Factura production productiva real, ya autorizada -- 001-002-000000001.
    harness.seed('FacturasFiscales', [{
      ID: 'FACT-HIST-1', Status: 'AUTHORIZED', Environment: 'production',
      Establishment: '001', EmissionPoint: '002', Sequential: '000000001', DocumentNumber: '001-002-000000001',
      AccessKey: 'clave-historica-real', XmlAuthorizedReference: 'xml-ref', RideReference: 'ride-ref',
    }])
    const facturaAntes = JSON.stringify(harness.objects('FacturasFiscales'))

    const result = harness.context.processRequest({ action: 'migrarCatalogoFiscalV2', token: 'admin-token', confirmacion: 'APLICAR_CATALOGO_FISCAL_V2' })

    expect(result.success).toBe(true)
    expect(result.data.codigosCreados).toEqual(['CAPACITACION_RA'])
    const catalogo = harness.objects('ConfiguracionFiscal')
    expect(catalogo.map(item => item.CodigoInterno).sort()).toEqual(['CAPACITACION', 'CAPACITACION_CERTIFICADO', 'CAPACITACION_RA', 'PRUEBA_TECNICA_SRI'])
    // Las filas preexistentes conservan su ID -- no fueron recreadas ni eliminadas.
    expect(catalogo.find(item => item.CodigoInterno === 'CAPACITACION')).toMatchObject({ ID: 'FCFG-1' })
    expect(catalogo.find(item => item.CodigoInterno === 'CAPACITACION_CERTIFICADO')).toMatchObject({ ID: 'FCFG-2' })
    expect(catalogo.find(item => item.CodigoInterno === 'PRUEBA_TECNICA_SRI')).toMatchObject({ ID: 'FCFG-3', TestOnly: true })
    // La factura histórica autorizada 001-002-000000001 queda exactamente igual.
    expect(JSON.stringify(harness.objects('FacturasFiscales'))).toBe(facturaAntes)
  })

  it('migrarCatalogoFiscalV2 ejecutado dos veces no duplica CAPACITACION_RA', () => {
    const harness = seededHarness()
    migrar(harness)
    const first = harness.context.processRequest({ action: 'migrarCatalogoFiscalV2', token: 'admin-token', confirmacion: 'APLICAR_CATALOGO_FISCAL_V2' })
    const second = harness.context.processRequest({ action: 'migrarCatalogoFiscalV2', token: 'admin-token', confirmacion: 'APLICAR_CATALOGO_FISCAL_V2' })
    expect(first.data.codigosCreados).toEqual([])
    expect(second.data.codigosCreados).toEqual([])
    const coincidencias = harness.objects('ConfiguracionFiscal').filter(item => item.CodigoInterno === 'CAPACITACION_RA')
    expect(coincidencias).toHaveLength(1)
  })
})

describe('catalogo TEST_ONLY - bloqueo absoluto en produccion', () => {
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
  it('acepta en production un curso R.A. Training avalado por ITSAL con IVA 0% configurado por producto', () => {
    const harness = seededHarness()
    migrar(harness)
    const result = harness.context.processRequest(draftParams({ environment: 'production', idempotencyKey: 'idem-prod-1' }))
    expect(result.success).toBe(true)
    expect(result.data.Subtotal0).toBe(100)
    expect(result.data.SubtotalTaxed).toBe(0)
    expect(result.data.TaxTotal).toBe(0)
    expect(result.data.GrandTotal).toBe(100)
    expect(harness.objects('FacturaItems')[0].SriTaxCode).toBe('2:0')
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

  it('confirmarValidacionTributariaFiscal mantiene auditable la confirmacion de un codigo', () => {
    const harness = seededHarness()
    migrar(harness)
    const confirm = harness.context.processRequest({
      action: 'confirmarValidacionTributariaFiscal', token: 'admin-token',
      codigoInterno: 'CAPACITACION', motivo: 'Confirmado por contador externo tras revision de RUC y actividad economica.',
    })
    expect(confirm.success).toBe(true)
    expect(confirm.data.validacionTributaria).toBe('confirmado')
    expect(harness.objects('AuditoriaFiscal').some(item => item.Accion === 'TAX_VALIDATION_CONFIRM' && item.EstadoNuevo === 'confirmado')).toBe(true)
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
    expect(result.error).toMatch(/cat.logo/i)
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

  it('rechaza un codigo SRI de impuesto que no coincide con el producto configurado', () => {
    const harness = seededHarness()
    migrar(harness)
    const result = harness.context.processRequest(draftParams({
      items: [{ ...ITEM_CAPACITACION, sriTaxCode: '2:4' }],
    }))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/SRI/)
  })

  it('rechaza taxTotal si no coincide con la suma de impuestos de los items', () => {
    const harness = seededHarness()
    migrar(harness)
    const result = harness.context.processRequest(draftParams({ taxTotal: 12, grandTotal: 112 }))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/taxTotal/)
  })

  it('crea un borrador válido en estado DRAFT y audita la creación', () => {
    const harness = seededHarness()
    migrar(harness)
    const result = harness.context.processRequest(draftParams())
    expect(result.success).toBe(true)
    expect(result.data.Status).toBe('DRAFT')
    expect(result.data.GrandTotal).toBe(100)
    expect(result.data.PaymentMethodInternal).toBe('Transferencia')
    expect(result.data.SriPaymentCode).toBe('20')
    expect(harness.objects('FacturaItems')).toHaveLength(1)
    expect(harness.objects('AuditoriaFiscal').map(item => item.Accion)).toContain('FACTURA_DRAFT_CREATED')
  })

  it('preserva como texto una identificación del receptor con cero inicial al crear FacturasFiscales', () => {
    const harness = seededHarness()
    migrar(harness)
    const result = harness.context.processRequest(draftParams({
      idempotencyKey: 'idem-zero-buyer',
      buyerIdentification: '0604989095',
      buyerName: 'Lizbeth Carolina Sanunga Guananga',
    }))

    const factura = harness.objects('FacturasFiscales')[0]
    const headers = harness.sheets.FacturasFiscales.rows[0]
    const identificationIndex = headers.indexOf('BuyerIdentification')
    expect(result.success).toBe(true)
    expect(factura.BuyerIdentification).toBe('0604989095')
    expect(harness.sheets.FacturasFiscales.formats[1][identificationIndex]).toBe('@')
  })

  it('bloquea production si la forma de pago no tiene codigo SRI resuelto', () => {
    const harness = seededHarness()
    migrar(harness)
    const result = harness.context.processRequest(draftParams({
      environment: 'production',
      idempotencyKey: 'idem-prod-payment-missing',
      paymentMethodInternal: 'Metodo no catalogado',
    }))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/SriPaymentCode/)
  })

  it('permite proporcionar SriPaymentCode explicito sin inventar una regla global', () => {
    const harness = seededHarness()
    migrar(harness)
    const result = harness.context.processRequest(draftParams({
      environment: 'production',
      idempotencyKey: 'idem-prod-payment-explicit',
      paymentMethodInternal: 'Pago bancario verificado',
      sriPaymentCode: '20',
    }))
    expect(result.success).toBe(true)
    expect(result.data.SriPaymentCode).toBe('20')
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


describe('backfill controlado de SriPaymentCode historico', () => {
  function seedFacturaAutorizada(harness, overrides = {}) {
    harness.seed('FacturasFiscales', [{
      ID: 'FACT-HIST',
      Environment: 'production',
      Status: 'DELIVERED',
      PaymentMethodInternal: 'Transferencia',
      SriPaymentCode: '',
      AccessKey: 'clave-historica',
      Establishment: '001',
      EmissionPoint: '002',
      Sequential: '000000001',
      DocumentNumber: '001-002-000000001',
      AuthorizationNumber: '1308202601069178737300120010020000000019473817618',
      AuthorizationDate: '2026-08-13T17:12:18-05:00',
      XmlAuthorizedReference: 'xml-ref',
      XmlAuthorizedContent: '<factura><pagos><pago><formaPago>20</formaPago><total>8.00</total></pago></pagos></factura>',
      RideReference: 'drive:ride-ref',
      Sha256Authorized: 'xml-sha',
      Sha256Ride: 'ride-sha',
      ...overrides,
    }])
  }

  it('completa SriPaymentCode una sola vez si el XML autorizado lo respalda', () => {
    const harness = seededHarness()
    migrar(harness)
    seedFacturaAutorizada(harness)

    const first = harness.context.processRequest({
      action: 'backfillSriPaymentCodeFacturaAutorizada',
      token: 'admin-token',
      facturaId: 'FACT-HIST',
      confirmacion: 'BACKFILL_SRI_PAYMENT_CODE',
      sriPaymentCode: '20',
    })
    const second = harness.context.processRequest({
      action: 'backfillSriPaymentCodeFacturaAutorizada',
      token: 'admin-token',
      facturaId: 'FACT-HIST',
      confirmacion: 'BACKFILL_SRI_PAYMENT_CODE',
      sriPaymentCode: '20',
    })

    expect(first.success).toBe(true)
    expect(first.changed).toBe(true)
    expect(second.success).toBe(true)
    expect(second.idempotent).toBe(true)
    const factura = harness.objects('FacturasFiscales')[0]
    expect(factura).toMatchObject({
      SriPaymentCode: '20',
      Status: 'DELIVERED',
      AccessKey: 'clave-historica',
      Sequential: '000000001',
      RideReference: 'drive:ride-ref',
      Sha256Authorized: 'xml-sha',
      Sha256Ride: 'ride-sha',
    })
    expect(harness.objects('AuditoriaFiscal').filter(item => item.Accion === 'FISCAL_PAYMENT_CODE_BACKFILLED')).toHaveLength(1)
  })

  it('bloquea el backfill si el XML autorizado no contiene ese formaPago', () => {
    const harness = seededHarness()
    migrar(harness)
    seedFacturaAutorizada(harness, { XmlAuthorizedContent: '<factura></factura>' })

    const result = harness.context.processRequest({
      action: 'backfillSriPaymentCodeFacturaAutorizada',
      token: 'admin-token',
      facturaId: 'FACT-HIST',
      confirmacion: 'BACKFILL_SRI_PAYMENT_CODE',
      sriPaymentCode: '20',
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/XML autorizado/)
    expect(harness.objects('FacturasFiscales')[0].SriPaymentCode).toBe('')
  })

  it('exige administrador y confirmacion explicita', () => {
    const harness = seededHarness()
    migrar(harness)
    seedFacturaAutorizada(harness)

    const noAdmin = harness.context.processRequest({
      action: 'backfillSriPaymentCodeFacturaAutorizada',
      token: 'seller-token',
      facturaId: 'FACT-HIST',
      confirmacion: 'BACKFILL_SRI_PAYMENT_CODE',
      sriPaymentCode: '20',
    })
    const noConfirm = harness.context.processRequest({
      action: 'backfillSriPaymentCodeFacturaAutorizada',
      token: 'admin-token',
      facturaId: 'FACT-HIST',
      sriPaymentCode: '20',
    })

    expect(noAdmin.success).toBe(false)
    expect(noConfirm.success).toBe(false)
  })
})

describe('recuperación de factura rechazada por identificación del receptor con cero inicial', () => {
  function seedFacturaRechazadaPorCedulaSinCero(harness, overrides = {}) {
    harness.seed('Inscripciones', [{
      ID: 'INS-ZERO',
      ClienteNombre: 'Lizbeth Carolina Sanunga Guananga',
      ClienteID: '0604989095',
      RUC: '',
    }])
    harness.seed('FacturasFiscales', [{
      ID: 'FACT-ZERO',
      Environment: 'production',
      Status: 'NOT_AUTHORIZED',
      InscripcionID: 'INS-ZERO',
      IdempotencyKey: 'inscripcion:INS-ZERO:pago-verificado:v1',
      DocumentType: '01',
      IssueDate: '2026-08-26T20:00:00.000Z',
      IssuerRuc: '0691787373001',
      Establishment: '001',
      EmissionPoint: '002',
      Sequential: '000000004',
      DocumentNumber: '001-002-000000004',
      AccessKey: '2608202601069178737300120010020000000045482075411',
      NumericCode: '54820754',
      BuyerIdentificationType: 'cedula',
      BuyerIdentification: '604989095',
      BuyerName: 'Lizbeth Carolina Sanunga Guananga',
      XmlGeneratedReference: 'old-generated-ref',
      XmlSignedReference: 'old-signed-ref',
      Sha256Generated: 'old-generated-sha',
      Sha256Signed: 'old-signed-sha',
      SriReceptionStatus: 'RECIBIDA',
      SriAuthorizationStatus: 'NO_AUTORIZADO',
      LastSriMessage: '[ERROR] 69: ERROR EN LA IDENTIFICACION DEL RECEPTOR',
      ReviewFlag: 'needs_review',
      ReviewReason: 'rechazo sri',
      ...overrides,
    }])
  }

  it('restaura BuyerIdentification desde Inscripciones, conserva clave/secuencial y reabre a GENERATED', () => {
    const harness = seededHarness()
    migrar(harness)
    seedFacturaRechazadaPorCedulaSinCero(harness)

    const result = harness.context.processRequest({
      action: 'recuperarFacturaRechazadaPorIdentificacionReceptor',
      token: 'admin-token',
      facturaId: 'FACT-ZERO',
      confirmacion: 'RECUPERAR_IDENTIFICACION_RECEPTOR',
    })

    const factura = harness.objects('FacturasFiscales')[0]
    expect(result.success).toBe(true)
    expect(factura).toMatchObject({
      ID: 'FACT-ZERO',
      Status: 'GENERATED',
      BuyerIdentification: '0604989095',
      BuyerIdentificationType: 'cedula',
      AccessKey: '2608202601069178737300120010020000000045482075411',
      Sequential: '000000004',
      DocumentNumber: '001-002-000000004',
      XmlGeneratedReference: '',
      XmlSignedReference: '',
      Sha256Generated: '',
      Sha256Signed: '',
      SriReceptionStatus: '',
      SriAuthorizationStatus: '',
      ReviewFlag: '',
      ReviewReason: '',
    })
    expect(harness.objects('AuditoriaFiscal').some(item => (
      item.Accion === 'FACTURA_BUYER_IDENTIFICATION_ZERO_PREFIX_RESTORED'
      && item.EstadoAnterior === 'NOT_AUTHORIZED'
      && item.EstadoNuevo === 'GENERATED'
      && item.Metadatos.includes('604989095')
      && item.Metadatos.includes('0604989095')
    ))).toBe(true)
  })

  it('bloquea la recuperación si la identificación no coincide numéricamente con la inscripción', () => {
    const harness = seededHarness()
    migrar(harness)
    seedFacturaRechazadaPorCedulaSinCero(harness, { BuyerIdentification: '1717171717' })

    const result = harness.context.processRequest({
      action: 'recuperarFacturaRechazadaPorIdentificacionReceptor',
      token: 'admin-token',
      facturaId: 'FACT-ZERO',
      confirmacion: 'RECUPERAR_IDENTIFICACION_RECEPTOR',
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no coincide numéricamente/)
    expect(harness.objects('FacturasFiscales')[0].Status).toBe('NOT_AUTHORIZED')
  })

  it('bloquea la recuperación para vendedor', () => {
    const harness = seededHarness()
    migrar(harness)
    seedFacturaRechazadaPorCedulaSinCero(harness)

    const result = harness.context.processRequest({
      action: 'recuperarFacturaRechazadaPorIdentificacionReceptor',
      token: 'seller-token',
      facturaId: 'FACT-ZERO',
      confirmacion: 'RECUPERAR_IDENTIFICACION_RECEPTOR',
    })

    expect(result.success).toBe(false)
    expect(harness.objects('FacturasFiscales')[0].BuyerIdentification).toBe('604989095')
  })
})

describe('recuperación de factura rechazada por fecha de emisión extemporánea', () => {
  function seedFacturaRechazadaPorFechaExtemporanea(harness, overrides = {}) {
    harness.seed('FacturasFiscales', [{
      ID: 'FACT-DATE',
      Environment: 'production',
      Status: 'NOT_AUTHORIZED',
      InscripcionID: 'INS-DATE',
      DocumentType: '01',
      IssueDate: '2026-08-27T02:30:00.000Z',
      IssuerRuc: '0691787373001',
      Establishment: '001',
      EmissionPoint: '002',
      Sequential: '000000005',
      DocumentNumber: '001-002-000000005',
      AccessKey: '2708202601069178737300120010020000000055533316110',
      NumericCode: '55333161',
      BuyerIdentificationType: 'ruc',
      BuyerIdentification: '0992912723001',
      BuyerName: 'Jonathan Eduardo Lopez Poveda',
      XmlGeneratedReference: 'old-generated-ref',
      XmlSignedReference: 'old-signed-ref',
      Sha256Generated: 'old-generated-sha',
      Sha256Signed: 'old-signed-sha',
      Sha256Authorized: 'old-authorized-sha',
      SriReceptionStatus: 'RECIBIDA',
      SriAuthorizationStatus: 'NO_AUTORIZADO',
      AuthorizationNumber: 'old-auth-number',
      AuthorizationDate: 'old-auth-date',
      AuthorizedAt: 'old-authorized-at',
      XmlAuthorizedReference: 'old-xml-authorized',
      XmlAuthorizedContent: '<xml/>',
      RideReference: 'old-ride',
      Sha256Ride: 'old-ride-sha',
      LastSriMessage: '[ERROR] 65: FECHA EMISION EXTEMPORANEA',
      ReviewFlag: 'needs_review',
      ReviewReason: 'rechazo sri',
      ...overrides,
    }])
  }

  it('descarta AccessKey/XML con fecha mala desde NOT_AUTHORIZED, conserva serie/secuencial y reabre a SEQUENCE_RESERVED', () => {
    const harness = seededHarness()
    migrar(harness)
    seedFacturaRechazadaPorFechaExtemporanea(harness)

    const result = harness.context.processRequest({
      action: 'recuperarFacturaRechazadaPorFechaEmisionExtemporanea',
      token: 'admin-token',
      facturaId: 'FACT-DATE',
      confirmacion: 'RECUPERAR_FECHA_EMISION_EXTEMPORANEA',
    })

    const factura = harness.objects('FacturasFiscales')[0]
    expect(result.success).toBe(true)
    expect(factura).toMatchObject({
      ID: 'FACT-DATE',
      Status: 'SEQUENCE_RESERVED',
      Establishment: '001',
      EmissionPoint: '002',
      Sequential: '000000005',
      DocumentNumber: '001-002-000000005',
      BuyerIdentification: '0992912723001',
      BuyerName: 'Jonathan Eduardo Lopez Poveda',
      AccessKey: '',
      NumericCode: '',
      IssueDate: '',
      XmlGeneratedReference: '',
      XmlSignedReference: '',
      Sha256Generated: '',
      Sha256Signed: '',
      Sha256Authorized: '',
      SriReceptionStatus: '',
      SriAuthorizationStatus: '',
      AuthorizationNumber: '',
      AuthorizationDate: '',
      AuthorizedAt: '',
      XmlAuthorizedReference: '',
      XmlAuthorizedContent: '',
      RideReference: '',
      Sha256Ride: '',
      LastSriMessage: '',
      ReviewFlag: '',
      ReviewReason: '',
    })
    expect(harness.objects('AuditoriaFiscal').some(item => (
      item.Accion === 'FACTURA_EXTEMPORANEOUS_ISSUE_DATE_RESET'
      && item.EstadoAnterior === 'NOT_AUTHORIZED'
      && item.EstadoNuevo === 'SEQUENCE_RESERVED'
      && item.Metadatos.includes('2708202601069178737300120010020000000055533316110')
      && item.Metadatos.includes('000000005')
    ))).toBe(true)
  })

  it('también recupera el caso real cuando el SRI devuelve la factura en Recepción como RETURNED', () => {
    const harness = seededHarness()
    migrar(harness)
    seedFacturaRechazadaPorFechaExtemporanea(harness, {
      Status: 'RETURNED',
      SriReceptionStatus: 'DEVUELTA',
      SriAuthorizationStatus: '',
    })

    const result = harness.context.processRequest({
      action: 'recuperarFacturaRechazadaPorFechaEmisionExtemporanea',
      token: 'admin-token',
      facturaId: 'FACT-DATE',
      confirmacion: 'RECUPERAR_FECHA_EMISION_EXTEMPORANEA',
    })

    const factura = harness.objects('FacturasFiscales')[0]
    expect(result.success).toBe(true)
    expect(factura.Status).toBe('SEQUENCE_RESERVED')
    expect(factura.Sequential).toBe('000000005')
    expect(factura.DocumentNumber).toBe('001-002-000000005')
    expect(factura.AccessKey).toBe('')
    expect(factura.SriReceptionStatus).toBe('')
    expect(harness.objects('AuditoriaFiscal').some(item => (
      item.Accion === 'FACTURA_EXTEMPORANEOUS_ISSUE_DATE_RESET'
      && item.EstadoAnterior === 'RETURNED'
      && item.EstadoNuevo === 'SEQUENCE_RESERVED'
    ))).toBe(true)
  })

  it('bloquea vendedor', () => {
    const harness = seededHarness()
    migrar(harness)
    seedFacturaRechazadaPorFechaExtemporanea(harness)

    const result = harness.context.processRequest({
      action: 'recuperarFacturaRechazadaPorFechaEmisionExtemporanea',
      token: 'seller-token',
      facturaId: 'FACT-DATE',
      confirmacion: 'RECUPERAR_FECHA_EMISION_EXTEMPORANEA',
    })
    expect(result.success).toBe(false)
    expect(harness.objects('FacturasFiscales')[0].Status).toBe('NOT_AUTHORIZED')
  })

  it('bloquea facturas que no tengan el rechazo exacto por fecha', () => {
    const harness = seededHarness()
    migrar(harness)
    seedFacturaRechazadaPorFechaExtemporanea(harness, { LastSriMessage: '[ERROR] 39: FIRMA INVALIDA' })

    const result = harness.context.processRequest({
      action: 'recuperarFacturaRechazadaPorFechaEmisionExtemporanea',
      token: 'admin-token',
      facturaId: 'FACT-DATE',
      confirmacion: 'RECUPERAR_FECHA_EMISION_EXTEMPORANEA',
    })

    expect(result.success).toBe(false)
    expect(harness.objects('FacturasFiscales')[0].Status).toBe('NOT_AUTHORIZED')
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
    harness.seed('FacturasFiscales', [{ ID: 'FACT-LEGADO', Environment: 'test', Status: 'AUTHORIZED', Establishment: '001', EmissionPoint: '002', DocumentType: '01' }])

    const factura = crearBorrador(harness, 'idem-seq-conflict')
    const result = harness.context.processRequest({ action: 'reservarSecuencialFiscal', token: 'admin-token', facturaId: factura.ID, establishment: '001', emissionPoint: '002' })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/conflicto/i)
  })

  it('no trata una factura TEST como conflicto al reservar la primera factura PRODUCTION de la misma serie', () => {
    const harness = seededHarness()
    migrar(harness)
    harness.seed('FacturasFiscales', [{
      ID: 'FACT_TEST_PREVIA',
      Environment: 'test',
      Status: 'DELIVERED',
      Establishment: '001',
      EmissionPoint: '002',
      Sequential: '000000001',
    }])
    const draft = harness.context.processRequest(draftParams({ environment: 'production', idempotencyKey: 'idem-prod-seq-1' })).data
    const result = harness.context.processRequest({ action: 'reservarSecuencialFiscal', token: 'admin-token', facturaId: draft.ID, establishment: '001', emissionPoint: '002' })

    expect(result.success).toBe(true)
    const updated = harness.context.processRequest({ action: 'getFacturaFiscalCompleta', token: 'admin-token', facturaId: draft.ID }).data.factura
    expect(updated.Environment).toBe('production')
    expect(updated.Sequential).toBe('000000001')
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
    const result = harness.context.processRequest({ action: 'verificarConflictoSerieFiscal', token: 'admin-token', establishment: '001', emissionPoint: '002', environment: 'test' })
    expect(result.data.conflict).toBe(false)
  })

  it('reporta conflicto si ya hay una factura en esa serie, en ese mismo environment', () => {
    const harness = seededHarness()
    migrar(harness)
    harness.seed('FacturasFiscales', [{ ID: 'FACT-X', Environment: 'production', Status: 'AUTHORIZED', Establishment: '001', EmissionPoint: '002', DocumentType: '01' }])
    const result = harness.context.processRequest({ action: 'verificarConflictoSerieFiscal', token: 'admin-token', establishment: '001', emissionPoint: '002', environment: 'production' })
    expect(result.data.conflict).toBe(true)
  })

  it('environment es obligatorio -- sin él, se rechaza en vez de mezclar series de ambientes distintos', () => {
    const harness = seededHarness()
    migrar(harness)
    const result = harness.context.processRequest({ action: 'verificarConflictoSerieFiscal', token: 'admin-token', establishment: '001', emissionPoint: '002' })
    expect(result.success).toBe(false)
  })

  it('regresión: una factura TEST_ONLY en 001-002 (test) NO contamina la lectura de conflicto en production sobre la MISMA serie -- bug real que causaba el falso "conflicto de lectura" al previsualizar la primera factura productiva', () => {
    const harness = seededHarness()
    migrar(harness)
    harness.seed('FacturasFiscales', [{ ID: 'FACT_TEST_ONLY', Environment: 'test', Status: 'AUTHORIZED', Establishment: '001', EmissionPoint: '002', DocumentType: '01' }])

    const enProduction = harness.context.processRequest({ action: 'verificarConflictoSerieFiscal', token: 'admin-token', establishment: '001', emissionPoint: '002', environment: 'production' })
    expect(enProduction.data.conflict).toBe(false)
    expect(enProduction.data.facturasEncontradas).toBe(0)

    const enTest = harness.context.processRequest({ action: 'verificarConflictoSerieFiscal', token: 'admin-token', establishment: '001', emissionPoint: '002', environment: 'test' })
    expect(enTest.data.conflict).toBe(true)
    expect(enTest.data.facturasEncontradas).toBe(1)
  })
})

// Orden FISICO real de la hoja productiva ConfiguracionFiscal: SriTaxCode fue
// agregado historicamente al FINAL, no en la posicion que tiene en
// SHEET_HEADERS.ConfiguracionFiscal (donde aparece justo después de
// TaxRateBasisPoints). Este es el escenario real que causó el bug de v24.
const PRODUCTIVE_CONFIGURACION_FISCAL_HEADERS = [
  'ID', 'CodigoInterno', 'Descripcion', 'TaxRateBasisPoints', 'Activo', 'Version',
  'ActualizadoPor', 'ActualizadoEn', 'ValidacionTributaria', 'ValidadoPor', 'ValidadoEn',
  'MotivoValidacion', 'TestOnly', 'SriTaxCode',
]

// Construye la hoja ConfiguracionFiscal con el orden físico real de producción --
// sin pasar por harness.seed(), que respeta el orden declarado en Code.gs y por
// tanto no puede reproducir el desfase real.
function harnessConOrdenFisicoProductivo() {
  const harness = seededHarness()
  const sheet = harness.ensureSheet('ConfiguracionFiscal')
  sheet.rows = [[...PRODUCTIVE_CONFIGURACION_FISCAL_HEADERS]]
  sheet.formulas = [PRODUCTIVE_CONFIGURACION_FISCAL_HEADERS.map(() => '')]
  return harness
}

// Agrega una fila usando el orden FÍSICO actual de la hoja (nunca SHEET_HEADERS) --
// simula exactamente lo que el motor de Sheets ve, independientemente de cómo llegó
// cada valor a su columna.
function appendRowByHeaders(sheet, valuesByHeader) {
  const headers = sheet.rows[0]
  sheet.appendRow(headers.map(h => (valuesByHeader[h] !== undefined ? valuesByHeader[h] : '')))
}

function filaSanaConOrdenFisico(codigoInterno, overrides = {}) {
  return {
    ID: 'FCFG-' + codigoInterno,
    CodigoInterno: codigoInterno,
    Descripcion: 'Descripcion ' + codigoInterno,
    TaxRateBasisPoints: 0,
    Activo: true,
    Version: 1,
    ActualizadoPor: 'admin.test',
    ActualizadoEn: '2025-01-01T00:00:00.000Z',
    ValidacionTributaria: 'pendiente',
    ValidadoPor: '',
    ValidadoEn: '',
    MotivoValidacion: '',
    TestOnly: codigoInterno === 'PRUEBA_TECNICA_SRI',
    SriTaxCode: '',
    ...overrides,
  }
}

// Firma EXACTA del corrimiento de columnas de v24 (derivada de appendRow escribiendo
// por posición de SHEET_HEADERS sobre una hoja cuyo orden físico real es distinto):
// cada valor quedó una columna desplazado. Ver esFilaCapacitacionRaMalformadaPorOrdenV24_.
function filaCapacitacionRaMalformadaV24() {
  return {
    ID: 'FCFG-RA-BAD', CodigoInterno: 'CAPACITACION_RA',
    Descripcion: 'Curso de formacion R.A. Training sin aval externo',
    TaxRateBasisPoints: 0,
    Activo: '2:0', Version: true, ActualizadoPor: 2, ActualizadoEn: 'admin.test',
    ValidacionTributaria: '2026-01-01T00:00:00.000Z', ValidadoPor: 'confirmado', ValidadoEn: '',
    MotivoValidacion: '',
    TestOnly: 'Confirmacion contable interna 2026-08-16: los cursos propios de R.A. Training sin aval externo se facturan con IVA 0%.',
    SriTaxCode: false,
  }
}

function migrarV2(harness) {
  return harness.context.processRequest({ action: 'migrarCatalogoFiscalV2', token: 'admin-token', confirmacion: 'APLICAR_CATALOGO_FISCAL_V2' })
}

function seedCatalogoSanoBase(sheet) {
  appendRowByHeaders(sheet, filaSanaConOrdenFisico('CAPACITACION', { ID: 'FCFG-CAP', ValidacionTributaria: 'confirmado', SriTaxCode: '2:0' }))
  appendRowByHeaders(sheet, filaSanaConOrdenFisico('CAPACITACION_CERTIFICADO', { ID: 'FCFG-CERT', ValidacionTributaria: 'confirmado', SriTaxCode: '2:0' }))
  appendRowByHeaders(sheet, filaSanaConOrdenFisico('PRUEBA_TECNICA_SRI', { ID: 'FCFG-TEST', SriTaxCode: '2:0' }))
}

describe('reparación del catálogo fiscal — bug de orden físico de columnas (v24)', () => {
  it('1. la hoja productiva simulada tiene SriTaxCode al final, no en la posición de SHEET_HEADERS', () => {
    const harness = harnessConOrdenFisicoProductivo()
    const headers = harness.sheets.ConfiguracionFiscal.rows[0]
    expect(headers[headers.length - 1]).toBe('SriTaxCode')
    expect(headers.indexOf('SriTaxCode')).not.toBe(4)
  })

  it('2/3/4/5/6/7. migrarCatalogoFiscalV2 crea CAPACITACION_RA en las columnas físicas correctas', () => {
    const harness = harnessConOrdenFisicoProductivo()
    const sheet = harness.ensureSheet('ConfiguracionFiscal')
    seedCatalogoSanoBase(sheet)

    const result = migrarV2(harness)
    expect(result.success).toBe(true)
    expect(result.data.codigosCreados).toContain('CAPACITACION_RA')

    const ra = harness.objects('ConfiguracionFiscal').find(item => item.CodigoInterno === 'CAPACITACION_RA')
    expect(ra.Activo).toBe(true)
    expect(Number(ra.Version)).toBe(2)
    expect(ra.SriTaxCode).toBe('2:0')
    expect(ra.ValidacionTributaria).toBe('confirmado')
    expect(ra.TestOnly).toBe(false)
  })

  it('8/9/10/11/12/13. detecta y repara EN LA MISMA FILA la CAPACITACION_RA malformada por v24, sin duplicar', () => {
    const harness = harnessConOrdenFisicoProductivo()
    const sheet = harness.ensureSheet('ConfiguracionFiscal')
    seedCatalogoSanoBase(sheet)
    appendRowByHeaders(sheet, filaCapacitacionRaMalformadaV24())
    const filasAntes = harness.objects('ConfiguracionFiscal').length

    const result = migrarV2(harness)

    expect(result.success).toBe(true)
    expect(result.data.codigosReparados).toEqual(['CAPACITACION_RA'])
    expect(harness.objects('ConfiguracionFiscal')).toHaveLength(filasAntes)

    const ra = harness.objects('ConfiguracionFiscal').find(item => item.CodigoInterno === 'CAPACITACION_RA')
    expect(ra.ID).toBe('FCFG-RA-BAD')
    expect(ra.Descripcion).toBe('Curso de formacion R.A. Training sin aval externo')
    expect(ra.Activo).toBe(true)
    expect(Number(ra.Version)).toBe(2)
    expect(ra.SriTaxCode).toBe('2:0')
    expect(ra.ValidacionTributaria).toBe('confirmado')
    expect(ra.ValidadoPor).toBe('')
    expect(ra.ValidadoEn).toBe('')
    expect(ra.MotivoValidacion).toBe('Confirmacion contable interna 2026-08-16: los cursos propios de R.A. Training sin aval externo se facturan con IVA 0%.')
    expect(ra.TestOnly).toBe(false)

    const auditoria = harness.objects('AuditoriaFiscal')
    expect(auditoria.map(item => item.Accion)).toContain('FISCAL_CATALOG_ROW_REPAIRED')
    const evento = auditoria.find(item => item.Accion === 'FISCAL_CATALOG_ROW_REPAIRED')
    expect(evento.Metadatos).toMatch(/CAPACITACION_RA/)
    expect(evento.Metadatos).toMatch(/header_order_mismatch_v24/)
  })

  it('14/15. segunda ejecución es idempotente y no vuelve a reparar una fila ya sana', () => {
    const harness = harnessConOrdenFisicoProductivo()
    const sheet = harness.ensureSheet('ConfiguracionFiscal')
    seedCatalogoSanoBase(sheet)
    appendRowByHeaders(sheet, filaCapacitacionRaMalformadaV24())

    migrarV2(harness)
    const second = migrarV2(harness)

    expect(second.success).toBe(true)
    expect(second.data.codigosReparados).toEqual([])
    expect(harness.objects('ConfiguracionFiscal').filter(item => item.CodigoInterno === 'CAPACITACION_RA')).toHaveLength(1)
  })

  it('16. una CAPACITACION_RA ambigua (no sana, no coincide con la firma exacta del bug) -> fail closed', () => {
    const harness = harnessConOrdenFisicoProductivo()
    const sheet = harness.ensureSheet('ConfiguracionFiscal')
    seedCatalogoSanoBase(sheet)
    appendRowByHeaders(sheet, { ...filaCapacitacionRaMalformadaV24(), ValidadoPor: 'algo-inesperado' })

    const result = migrarV2(harness)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/revisión manual/)
  })

  it('17/18/19. CAPACITACION, CAPACITACION_CERTIFICADO y PRUEBA_TECNICA_SRI quedan intactos durante la reparación', () => {
    const harness = harnessConOrdenFisicoProductivo()
    const sheet = harness.ensureSheet('ConfiguracionFiscal')
    seedCatalogoSanoBase(sheet)
    appendRowByHeaders(sheet, filaCapacitacionRaMalformadaV24())

    migrarV2(harness)

    const catalogo = harness.objects('ConfiguracionFiscal')
    expect(catalogo.find(item => item.CodigoInterno === 'CAPACITACION')).toMatchObject({ ID: 'FCFG-CAP' })
    expect(catalogo.find(item => item.CodigoInterno === 'CAPACITACION_CERTIFICADO')).toMatchObject({ ID: 'FCFG-CERT' })
    expect(catalogo.find(item => item.CodigoInterno === 'PRUEBA_TECNICA_SRI')).toMatchObject({ ID: 'FCFG-TEST', TestOnly: true })
  })

  it('20/21. FacturasFiscales y SecuenciaFiscal quedan en 0 cambios durante la reparación', () => {
    const harness = harnessConOrdenFisicoProductivo()
    const sheet = harness.ensureSheet('ConfiguracionFiscal')
    seedCatalogoSanoBase(sheet)
    appendRowByHeaders(sheet, filaCapacitacionRaMalformadaV24())
    harness.seed('FacturasFiscales', [{ ID: 'FACT-HIST-1', Status: 'AUTHORIZED', Environment: 'production', Establishment: '001', EmissionPoint: '002', Sequential: '000000001', DocumentNumber: '001-002-000000001' }])
    harness.seed('SecuenciaFiscal', [{ ID: 'SEQ-1', Environment: 'production', Establishment: '001', EmissionPoint: '002', DocumentType: '01', LastSequential: 1 }])
    const facturasAntes = JSON.stringify(harness.objects('FacturasFiscales'))
    const secuenciaAntes = JSON.stringify(harness.objects('SecuenciaFiscal'))

    migrarV2(harness)

    expect(JSON.stringify(harness.objects('FacturasFiscales'))).toBe(facturasAntes)
    expect(JSON.stringify(harness.objects('SecuenciaFiscal'))).toBe(secuenciaAntes)
  })

  it('22. ninguna llamada real al SRI: la reparación del catálogo nunca toca FacturasFiscales', () => {
    const harness = harnessConOrdenFisicoProductivo()
    const sheet = harness.ensureSheet('ConfiguracionFiscal')
    appendRowByHeaders(sheet, filaCapacitacionRaMalformadaV24())
    harness.seed('FacturasFiscales', [])

    const result = migrarV2(harness)

    expect(result.success).toBe(true)
    expect(harness.objects('FacturasFiscales')).toEqual([])
  })
})

describe('migrarModuloFiscal respeta el orden físico real (mismo riesgo que migrarCatalogoFiscalV2)', () => {
  it('siembra el catálogo inicial en las columnas físicas correctas aunque SriTaxCode esté al final de la hoja', () => {
    const harness = harnessConOrdenFisicoProductivo()
    harness.properties.set('SRI_MIGRATION_CONFIRMATION', 'APPLY_SRI_MIGRATION_ONCE')

    const result = harness.context.processRequest({
      action: 'migrarModuloFiscal', token: 'admin-token', confirmacion: 'APLICAR_MODULO_FISCAL',
    })

    expect(result.success).toBe(true)
    const catalogo = harness.objects('ConfiguracionFiscal')
    const capacitacion = catalogo.find(item => item.CodigoInterno === 'CAPACITACION')
    const ra = catalogo.find(item => item.CodigoInterno === 'CAPACITACION_RA')
    expect(capacitacion.SriTaxCode).toBe('2:0')
    expect(capacitacion.Activo).toBe(true)
    expect(ra.SriTaxCode).toBe('2:0')
    expect(ra.Activo).toBe(true)
    expect(Number(ra.Version)).toBe(2)
    expect(ra.ValidacionTributaria).toBe('confirmado')
  })
})

// Helper module-scope (draftParams/ITEM_CAPACITACION ya están definidos arriba) --
// crearBorrador() dentro de 'reserva atómica de secuencial' es local a ese describe,
// así que se define uno propio aquí con environment variable.
function crearBorradorEnv(harness, idempotencyKey, environment, overrides = {}) {
  return harness.context.processRequest(draftParams({ idempotencyKey, environment, ...overrides })).data
}

describe('idempotencia cruzada entre ambientes (crearBorradorFactura) — causa raíz #1', () => {
  it('1. una IdempotencyKey usada en TEST no satisface un request PRODUCTION (no es idempotente)', () => {
    const harness = seededHarness()
    migrar(harness)
    harness.seed('FacturasFiscales', [{
      ID: 'FACT-TEST-DRAFT', Environment: 'test', Status: 'DRAFT', InscripcionID: 'INS_X',
      IdempotencyKey: 'inscripcion:INS_X:pago-verificado:v1',
    }])

    const result = harness.context.processRequest(draftParams({
      environment: 'production', idempotencyKey: 'inscripcion:INS_X:pago-verificado:v1', inscripcionId: 'INS_X',
    }))

    expect(result.success).toBe(true)
    expect(result.idempotent).toBe(false)
    expect(result.data.ID).not.toBe('FACT-TEST-DRAFT')
    expect(result.data.Environment).toBe('production')
    expect(harness.objects('AuditoriaFiscal').some(item => item.Accion === 'IDEMPOTENCY_KEY_CROSS_ENVIRONMENT_IGNORED')).toBe(true)
  })

  it('2. misma IdempotencyKey + mismo environment production -> sí idempotente', () => {
    const harness = seededHarness()
    migrar(harness)
    const first = crearBorradorEnv(harness, 'idem-prod-1', 'production')
    const second = harness.context.processRequest(draftParams({ environment: 'production', idempotencyKey: 'idem-prod-1' }))
    expect(second.idempotent).toBe(true)
    expect(second.data.ID).toBe(first.ID)
  })

  it('3. misma IdempotencyKey + mismo environment test -> sí idempotente', () => {
    const harness = seededHarness()
    migrar(harness)
    const first = crearBorradorEnv(harness, 'idem-test-1', 'test')
    const second = harness.context.processRequest(draftParams({ environment: 'test', idempotencyKey: 'idem-test-1' }))
    expect(second.idempotent).toBe(true)
    expect(second.data.ID).toBe(first.ID)
  })

  it('4. el request production no modifica el DRAFT test existente con la misma IdempotencyKey', () => {
    const harness = seededHarness()
    migrar(harness)
    harness.seed('FacturasFiscales', [{
      ID: 'FACT-TEST-DRAFT', Environment: 'test', Status: 'DRAFT', InscripcionID: 'INS_X',
      IdempotencyKey: 'inscripcion:INS_X:pago-verificado:v1',
    }])
    const antes = JSON.stringify(harness.objects('FacturasFiscales').find(f => f.ID === 'FACT-TEST-DRAFT'))

    harness.context.processRequest(draftParams({
      environment: 'production', idempotencyKey: 'inscripcion:INS_X:pago-verificado:v1', inscripcionId: 'INS_X',
    }))

    const despues = JSON.stringify(harness.objects('FacturasFiscales').find(f => f.ID === 'FACT-TEST-DRAFT'))
    expect(despues).toBe(antes)
  })
})

describe('DocumentType numérico en Sheets (reservarSecuencialFiscal / verificarConflictoSerieFiscal) — causa raíz #2', () => {
  it('5. contador con DocumentType físico número 1 se encuentra al reservar tipo "01"', () => {
    const harness = seededHarness()
    migrar(harness)
    harness.seed('SecuenciaFiscal', [{ ID: 'SEQ-1', Environment: 'production', Establishment: '001', EmissionPoint: '002', DocumentType: 1, LastSequential: 1 }])
    const draft = crearBorradorEnv(harness, 'idem-doc-numero', 'production')
    const result = harness.context.processRequest({ action: 'reservarSecuencialFiscal', token: 'admin-token', facturaId: draft.ID, establishment: '001', emissionPoint: '002', documentType: '01' })
    expect(result.success).toBe(true)
    expect(result.data.sequential).toBe('000000002')
  })

  it('6. contador con DocumentType string "1" se encuentra al reservar tipo "01"', () => {
    const harness = seededHarness()
    migrar(harness)
    harness.seed('SecuenciaFiscal', [{ ID: 'SEQ-1', Environment: 'production', Establishment: '001', EmissionPoint: '002', DocumentType: '1', LastSequential: 1 }])
    const draft = crearBorradorEnv(harness, 'idem-doc-string-1', 'production')
    const result = harness.context.processRequest({ action: 'reservarSecuencialFiscal', token: 'admin-token', facturaId: draft.ID, establishment: '001', emissionPoint: '002', documentType: '01' })
    expect(result.success).toBe(true)
    expect(result.data.sequential).toBe('000000002')
  })

  it('7. contador con DocumentType string "01" se encuentra (caso ya sano, sigue funcionando)', () => {
    const harness = seededHarness()
    migrar(harness)
    harness.seed('SecuenciaFiscal', [{ ID: 'SEQ-1', Environment: 'production', Establishment: '001', EmissionPoint: '002', DocumentType: '01', LastSequential: 1 }])
    const draft = crearBorradorEnv(harness, 'idem-doc-string-01', 'production')
    const result = harness.context.processRequest({ action: 'reservarSecuencialFiscal', token: 'admin-token', facturaId: draft.ID, establishment: '001', emissionPoint: '002', documentType: '01' })
    expect(result.success).toBe(true)
    expect(result.data.sequential).toBe('000000002')
  })

  it('8/9. reservar sobre production con LastSequential=1 devuelve 000000002 y actualiza el contador production a 2', () => {
    const harness = seededHarness()
    migrar(harness)
    harness.seed('SecuenciaFiscal', [{ ID: 'SEQ-1', Environment: 'production', Establishment: '001', EmissionPoint: '002', DocumentType: 1, LastSequential: 1 }])
    const draft = crearBorradorEnv(harness, 'idem-lastseq', 'production')
    const result = harness.context.processRequest({ action: 'reservarSecuencialFiscal', token: 'admin-token', facturaId: draft.ID, establishment: '001', emissionPoint: '002', documentType: '01' })
    expect(result.data.sequential).toBe('000000002')
    const contador = harness.objects('SecuenciaFiscal').find(item => item.ID === 'SEQ-1')
    expect(Number(contador.LastSequential)).toBe(2)
  })

  it('10. reservar en production no modifica el contador test', () => {
    const harness = seededHarness()
    migrar(harness)
    harness.seed('SecuenciaFiscal', [
      { ID: 'SEQ-TEST', Environment: 'test', Establishment: '001', EmissionPoint: '002', DocumentType: '01', LastSequential: 5 },
      { ID: 'SEQ-PROD', Environment: 'production', Establishment: '001', EmissionPoint: '002', DocumentType: 1, LastSequential: 1 },
    ])
    const draft = crearBorradorEnv(harness, 'idem-iso-env', 'production')
    harness.context.processRequest({ action: 'reservarSecuencialFiscal', token: 'admin-token', facturaId: draft.ID, establishment: '001', emissionPoint: '002', documentType: '01' })
    const contadorTest = harness.objects('SecuenciaFiscal').find(item => item.ID === 'SEQ-TEST')
    expect(Number(contadorTest.LastSequential)).toBe(5)
  })

  it('11. un contador de DocumentType 04 no participa en la reserva de tipo 01 (primer uso real de 01, no continúa el contador 04)', () => {
    const harness = seededHarness()
    migrar(harness)
    harness.seed('SecuenciaFiscal', [{ ID: 'SEQ-04', Environment: 'production', Establishment: '001', EmissionPoint: '002', DocumentType: '04', LastSequential: 9 }])
    const draft = crearBorradorEnv(harness, 'idem-tipo01-vs-04', 'production')
    const result = harness.context.processRequest({ action: 'reservarSecuencialFiscal', token: 'admin-token', facturaId: draft.ID, establishment: '001', emissionPoint: '002', documentType: '01' })
    expect(result.success).toBe(true)
    expect(result.data.sequential).toBe('000000001')
  })

  it('12. una factura previa de DocumentType 04 en la misma serie NO produce conflicto al reservar tipo 01 (primer uso)', () => {
    const harness = seededHarness()
    migrar(harness)
    harness.seed('FacturasFiscales', [{ ID: 'FACT-04', Environment: 'production', Status: 'AUTHORIZED', Establishment: '001', EmissionPoint: '002', DocumentType: '04' }])
    const draft = crearBorradorEnv(harness, 'idem-sin-conflicto-04', 'production')
    const result = harness.context.processRequest({ action: 'reservarSecuencialFiscal', token: 'admin-token', facturaId: draft.ID, establishment: '001', emissionPoint: '002', documentType: '01' })
    expect(result.success).toBe(true)
    expect(result.data.sequential).toBe('000000001')
  })

  it('13. verificarConflictoSerieFiscal filtra por DocumentType: una factura tipo 04 no genera conflicto para tipo 01', () => {
    const harness = seededHarness()
    migrar(harness)
    harness.seed('FacturasFiscales', [{ ID: 'FACT-04', Environment: 'production', Status: 'AUTHORIZED', Establishment: '001', EmissionPoint: '002', DocumentType: '04' }])

    const para01 = harness.context.processRequest({ action: 'verificarConflictoSerieFiscal', token: 'admin-token', establishment: '001', emissionPoint: '002', documentType: '01', environment: 'production' })
    expect(para01.data.conflict).toBe(false)
    expect(para01.data.facturasEncontradas).toBe(0)

    const para04 = harness.context.processRequest({ action: 'verificarConflictoSerieFiscal', token: 'admin-token', establishment: '001', emissionPoint: '002', documentType: '04', environment: 'production' })
    expect(para04.data.conflict).toBe(true)
    expect(para04.data.facturasEncontradas).toBe(1)
  })

  it('14. verificarConflictoSerieFiscal reconoce un contador físicamente guardado como número 1 al pedir documentType "01"', () => {
    const harness = seededHarness()
    migrar(harness)
    harness.seed('SecuenciaFiscal', [{ ID: 'SEQ-1', Environment: 'production', Establishment: '001', EmissionPoint: '002', DocumentType: 1, LastSequential: 1 }])
    const result = harness.context.processRequest({ action: 'verificarConflictoSerieFiscal', token: 'admin-token', establishment: '001', emissionPoint: '002', documentType: '01', environment: 'production' })
    expect(result.data.contadoresEncontrados).toBe(1)
    expect(result.data.ultimoSecuencialEnFinance).toBe(1)
  })
})

describe('H. regresión del error exacto reportado ("Conflicto de serie" con contador físico 001/002/tipo 1)', () => {
  it('un contador Establishment=1/EmissionPoint=2/DocumentType=1/LastSequential=1 ya NO produce "Conflicto de serie" y reserva 000000002', () => {
    const harness = seededHarness()
    migrar(harness)
    harness.seed('SecuenciaFiscal', [{ ID: 'SEQ-1', Environment: 'production', Establishment: 1, EmissionPoint: 2, DocumentType: 1, LastSequential: 1 }])
    const draft = crearBorradorEnv(harness, 'idem-regresion-real', 'production')

    const result = harness.context.processRequest({ action: 'reservarSecuencialFiscal', token: 'admin-token', facturaId: draft.ID, establishment: '001', emissionPoint: '002', documentType: '01' })

    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
    expect(result.data.sequential).toBe('000000002')
  })
})

describe('F. caso real reproducido: DRAFT test + contadores/facturas físicamente desalineados en test y production', () => {
  it('production crea un NUEVO DRAFT (no continúa el test) y reserva 000000002 sin tocar el DRAFT test', () => {
    const harness = seededHarness()
    migrar(harness)
    harness.seed('FacturasFiscales', [
      { ID: 'FACT-TEST-DRAFT', Environment: 'test', Status: 'DRAFT', InscripcionID: 'INS_X', IdempotencyKey: 'inscripcion:INS_X:pago-verificado:v1' },
      { ID: 'FACT-TEST-PREVIA', Environment: 'test', Status: 'AUTHORIZED', Establishment: 1, EmissionPoint: 2, DocumentType: 1, Sequential: '000000001' },
      { ID: 'FACT-PROD-PREVIA', Environment: 'production', Status: 'DELIVERED', Establishment: 1, EmissionPoint: 2, DocumentType: 1, Sequential: '000000001' },
    ])
    harness.seed('SecuenciaFiscal', [
      { ID: 'SEQ-TEST', Environment: 'test', Establishment: 1, EmissionPoint: 2, DocumentType: 1, LastSequential: 1 },
      { ID: 'SEQ-PROD', Environment: 'production', Establishment: 1, EmissionPoint: 2, DocumentType: 1, LastSequential: 1 },
    ])
    const antesTestDraft = JSON.stringify(harness.objects('FacturasFiscales').find(f => f.ID === 'FACT-TEST-DRAFT'))

    const draft = harness.context.processRequest(draftParams({
      environment: 'production', idempotencyKey: 'inscripcion:INS_X:pago-verificado:v1', inscripcionId: 'INS_X',
    }))
    expect(draft.success).toBe(true)
    expect(draft.idempotent).toBe(false)
    expect(draft.data.ID).not.toBe('FACT-TEST-DRAFT')
    expect(draft.data.Environment).toBe('production')

    const reserva = harness.context.processRequest({
      action: 'reservarSecuencialFiscal', token: 'admin-token', facturaId: draft.data.ID,
      establishment: '001', emissionPoint: '002', documentType: '01',
    })
    expect(reserva.success).toBe(true)
    expect(reserva.error).toBeUndefined()
    expect(reserva.data.sequential).toBe('000000002')

    const despuesTestDraft = JSON.stringify(harness.objects('FacturasFiscales').find(f => f.ID === 'FACT-TEST-DRAFT'))
    expect(despuesTestDraft).toBe(antesTestDraft)
  })
})
