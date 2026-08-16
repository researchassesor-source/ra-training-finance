import { describe, expect, it } from 'vitest'
import { createAppsScriptHarness } from './appsScriptHarness'

const FUTURE = '2099-01-01T00:00:00.000Z'
const CRM_TOKEN = 'crm-service-secreto-de-prueba'

function seededHarness() {
  const harness = createAppsScriptHarness()
  harness.seed('Sesiones', [
    { Token: 'admin-token', Username: 'admin.test', UserID: 'USR-A', Rol: 'admin', Nombre: 'Admin Test', Expira: FUTURE },
  ])
  harness.seed('Usuarios', [{ ID: 'USR-A', Nombre: 'Admin Test', Username: 'admin.test', Rol: 'admin', Activo: true }])
  harness.seed('Servicios', [{ ID: 'SRV-1', Nombre: 'Habilidades blandas para profesionales', Modalidad: 'Virtual', Duracion: '60', Activo: true }])
  harness.seed('AuditoriaCertificados', [])
  harness.seed('Certificados', [])
  harness.seed('Inscripciones', [])
  harness.seed('Ingresos', [])
  harness.seed('CRMCompras', [])
  harness.seed('EntregablesAval', [])
  harness.properties.set('CRM_SERVICE_TOKEN', CRM_TOKEN)
  return harness
}

function crmCall(harness, action, params) {
  return harness.context.processRequest(Object.assign({ action, serviceToken: CRM_TOKEN }, params))
}

function basePurchase(overrides) {
  return Object.assign({
    crmOrderId: 'ORD-1', crmEnrollmentId: 'ENR-1', crmContactId: 'CTC-1', crmCourseId: 'CRS-1',
    courseTitle: 'Habilidades blandas para profesionales', modality: 'Virtual',
    startDate: '2026-09-01', endDate: '2026-09-30',
    participant: { fullName: 'Ana Pérez', email: 'ana@example.com', identification: '0102030405' },
    offerType: 'FULL', amount: 20,
  }, overrides)
}

describe('getCrmEnrollmentCommerceState', () => {
  it('1. enrollment sin compras ni inscripción => NO_PURCHASE', () => {
    const harness = seededHarness()
    const result = crmCall(harness, 'getCrmEnrollmentCommerceState', { crmEnrollmentId: 'ENR-NUEVO' })
    expect(result.data.commercialState).toBe('NO_PURCHASE')
    expect(result.data.effectiveEntitlement).toBe('NONE')
    expect(result.data.financeInscripcionId).toBe('')
  })

  it('2. FULL pending => FULL_PENDING, entitlement NONE', () => {
    const harness = seededHarness()
    crmCall(harness, 'importCrmPurchase', basePurchase())
    const result = crmCall(harness, 'getCrmEnrollmentCommerceState', { crmEnrollmentId: 'ENR-1' })
    expect(result.data.commercialState).toBe('FULL_PENDING')
    expect(result.data.effectiveEntitlement).toBe('NONE')
  })

  it('3. FULL verified => FULL_VERIFIED, entitlement FULL', () => {
    const harness = seededHarness()
    crmCall(harness, 'importCrmPurchase', basePurchase())
    crmCall(harness, 'verificarPagoCompraCrm', { crmOrderId: 'ORD-1', numeroComprobante: 'C-1', fechaPago: '2026-09-01' })
    const result = crmCall(harness, 'getCrmEnrollmentCommerceState', { crmEnrollmentId: 'ENR-1' })
    expect(result.data.commercialState).toBe('FULL_VERIFIED')
    expect(result.data.effectiveEntitlement).toBe('FULL')
  })

  it('4. institucional pending => INSTITUTIONAL_PENDING, entitlement NONE', () => {
    const harness = seededHarness()
    crmCall(harness, 'importCrmPurchase', basePurchase({ crmOrderId: 'ORD-INST', offerType: 'INSTITUTIONAL', amount: 10 }))
    const result = crmCall(harness, 'getCrmEnrollmentCommerceState', { crmEnrollmentId: 'ENR-1' })
    expect(result.data.commercialState).toBe('INSTITUTIONAL_PENDING')
    expect(result.data.effectiveEntitlement).toBe('NONE')
  })

  it('5. institucional verified => INSTITUTIONAL_VERIFIED, entitlement INSTITUTIONAL', () => {
    const harness = seededHarness()
    crmCall(harness, 'importCrmPurchase', basePurchase({ crmOrderId: 'ORD-INST', offerType: 'INSTITUTIONAL', amount: 10 }))
    crmCall(harness, 'verificarPagoCompraCrm', { crmOrderId: 'ORD-INST', numeroComprobante: 'C-1', fechaPago: '2026-09-01' })
    const result = crmCall(harness, 'getCrmEnrollmentCommerceState', { crmEnrollmentId: 'ENR-1' })
    expect(result.data.commercialState).toBe('INSTITUTIONAL_VERIFIED')
    expect(result.data.effectiveEntitlement).toBe('INSTITUTIONAL')
  })

  it('6. institucional verified + upgrade pending => UPGRADE_PENDING, entitlement INSTITUTIONAL (conserva acceso)', () => {
    const harness = seededHarness()
    crmCall(harness, 'importCrmPurchase', basePurchase({ crmOrderId: 'ORD-INST', offerType: 'INSTITUTIONAL', amount: 10 }))
    crmCall(harness, 'verificarPagoCompraCrm', { crmOrderId: 'ORD-INST', numeroComprobante: 'C-1', fechaPago: '2026-09-01' })
    crmCall(harness, 'importCrmPurchase', basePurchase({ crmOrderId: 'ORD-UPG', offerType: 'AVAL_UPGRADE', parentCrmOrderId: 'ORD-INST', amount: 10 }))
    const result = crmCall(harness, 'getCrmEnrollmentCommerceState', { crmEnrollmentId: 'ENR-1' })
    expect(result.data.commercialState).toBe('UPGRADE_PENDING')
    expect(result.data.effectiveEntitlement).toBe('INSTITUTIONAL')
  })

  it('7. institucional verified + upgrade verified => FULL_UPGRADED, entitlement FULL', () => {
    const harness = seededHarness()
    crmCall(harness, 'importCrmPurchase', basePurchase({ crmOrderId: 'ORD-INST', offerType: 'INSTITUTIONAL', amount: 10 }))
    crmCall(harness, 'verificarPagoCompraCrm', { crmOrderId: 'ORD-INST', numeroComprobante: 'C-1', fechaPago: '2026-09-01' })
    crmCall(harness, 'importCrmPurchase', basePurchase({ crmOrderId: 'ORD-UPG', offerType: 'AVAL_UPGRADE', parentCrmOrderId: 'ORD-INST', amount: 10 }))
    crmCall(harness, 'verificarPagoCompraCrm', { crmOrderId: 'ORD-UPG', numeroComprobante: 'C-2', fechaPago: '2026-09-05' })
    const result = crmCall(harness, 'getCrmEnrollmentCommerceState', { crmEnrollmentId: 'ENR-1' })
    expect(result.data.commercialState).toBe('FULL_UPGRADED')
    expect(result.data.effectiveEntitlement).toBe('FULL')
  })

  it('8. compra cancelada no concede entitlement (CANCELLED cuando es la única)', () => {
    const harness = seededHarness()
    crmCall(harness, 'importCrmPurchase', basePurchase())
    // No existe accion dedicada de cancelacion todavia -- se simula el estado
    // directamente en la hoja, como lo haria una actualizacion administrativa futura.
    const sheet = harness.sheets.CRMCompras
    const headers = sheet.rows[0]
    sheet.rows[1][headers.indexOf('PaymentStatus')] = 'cancelado'
    const result = crmCall(harness, 'getCrmEnrollmentCommerceState', { crmEnrollmentId: 'ENR-1' })
    expect(result.data.commercialState).toBe('CANCELLED')
    expect(result.data.effectiveEntitlement).toBe('NONE')
  })

  it('9. dos retries de verificarPagoCompraCrm no cambian el resultado', () => {
    const harness = seededHarness()
    crmCall(harness, 'importCrmPurchase', basePurchase())
    crmCall(harness, 'verificarPagoCompraCrm', { crmOrderId: 'ORD-1', numeroComprobante: 'C-1', fechaPago: '2026-09-01' })
    const primero = crmCall(harness, 'getCrmEnrollmentCommerceState', { crmEnrollmentId: 'ENR-1' })
    crmCall(harness, 'verificarPagoCompraCrm', { crmOrderId: 'ORD-1', numeroComprobante: 'C-1', fechaPago: '2026-09-01' })
    crmCall(harness, 'verificarPagoCompraCrm', { crmOrderId: 'ORD-1', numeroComprobante: 'C-1', fechaPago: '2026-09-01' })
    const despues = crmCall(harness, 'getCrmEnrollmentCommerceState', { crmEnrollmentId: 'ENR-1' })
    expect(despues.data).toEqual(primero.data)
  })

  it('10. batch de múltiples enrollments devuelve cada uno correctamente', () => {
    const harness = seededHarness()
    crmCall(harness, 'importCrmPurchase', basePurchase({ crmOrderId: 'ORD-A', crmEnrollmentId: 'ENR-A' }))
    crmCall(harness, 'verificarPagoCompraCrm', { crmOrderId: 'ORD-A', numeroComprobante: 'C-1', fechaPago: '2026-09-01' })
    crmCall(harness, 'importCrmPurchase', basePurchase({ crmOrderId: 'ORD-B', crmEnrollmentId: 'ENR-B', offerType: 'INSTITUTIONAL', amount: 10 }))
    const result = crmCall(harness, 'getCrmEnrollmentCommerceStates', { crmEnrollmentIds: ['ENR-A', 'ENR-B', 'ENR-SIN-COMPRAS'] })
    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(3)
    expect(result.data.find(d => d.crmEnrollmentId === 'ENR-A').commercialState).toBe('FULL_VERIFIED')
    expect(result.data.find(d => d.crmEnrollmentId === 'ENR-B').commercialState).toBe('INSTITUTIONAL_PENDING')
    expect(result.data.find(d => d.crmEnrollmentId === 'ENR-SIN-COMPRAS').commercialState).toBe('NO_PURCHASE')
  })

  it('11. batch no filtra datos sensibles (sin RUC/dirección/teléfono)', () => {
    const harness = seededHarness()
    crmCall(harness, 'importCrmPurchase', basePurchase())
    const result = crmCall(harness, 'getCrmEnrollmentCommerceStates', { crmEnrollmentIds: ['ENR-1'] })
    const entry = result.data[0]
    const keys = Object.keys(entry)
    expect(keys).not.toContain('RUC')
    expect(keys).not.toContain('DireccionFactura')
    expect(keys).not.toContain('ClienteTelefono')
    expect(keys).not.toContain('ClienteID')
    expect(entry.purchases[0]).not.toHaveProperty('numeroComprobante')
    const purchaseKeys = Object.keys(entry.purchases[0])
    expect(purchaseKeys.sort()).toEqual(['amount', 'crmOrderId', 'offerType', 'parentCrmOrderId', 'paymentStatus', 'paymentVerifiedAt'].sort())
  })

  it('12. enrollment legacy (importCrmEnrollment, sin CRMCompras) => LEGACY_UNCLASSIFIED', () => {
    const harness = seededHarness()
    harness.context.processRequest({
      action: 'addInscripcion', token: 'admin-token', idempotencyKey: 'ENR-LEGACY',
      inscripcion: { crmEnrollmentId: 'ENR-LEGACY', crmContactId: 'CTC-L', crmCourseId: 'CRS-L', courseTitle: 'Habilidades blandas para profesionales', modality: 'Virtual', participant: { fullName: 'Legacy Persona', email: 'legacy@example.com' }, amount: 20 },
    })
    const result = crmCall(harness, 'getCrmEnrollmentCommerceState', { crmEnrollmentId: 'ENR-LEGACY' })
    expect(result.data.commercialState).toBe('LEGACY_UNCLASSIFIED')
    expect(result.data.effectiveEntitlement).toBe('NONE')
    expect(result.data.financeInscripcionId).toBeTruthy()
  })

  it('13. nunca clasifica FULL usando solo amount=20: una compra INSTITUTIONAL de $20 (monto atípico) no se convierte en FULL', () => {
    const harness = seededHarness()
    crmCall(harness, 'importCrmPurchase', basePurchase({ offerType: 'INSTITUTIONAL', amount: 20 }))
    crmCall(harness, 'verificarPagoCompraCrm', { crmOrderId: 'ORD-1', numeroComprobante: 'C-1', fechaPago: '2026-09-01' })
    const result = crmCall(harness, 'getCrmEnrollmentCommerceState', { crmEnrollmentId: 'ENR-1' })
    expect(result.data.commercialState).toBe('INSTITUTIONAL_VERIFIED')
    expect(result.data.purchases[0].amount).toBe(20)
  })

  it('14. la acción requiere serviceToken válido', () => {
    const harness = seededHarness()
    const sinToken = harness.context.processRequest({ action: 'getCrmEnrollmentCommerceState', crmEnrollmentId: 'ENR-1' })
    expect(sinToken.success).toBe(false)
    const tokenInvalido = harness.context.processRequest({ action: 'getCrmEnrollmentCommerceState', serviceToken: 'incorrecto', crmEnrollmentId: 'ENR-1' })
    expect(tokenInvalido.success).toBe(false)
  })

  it('15. integración CRM legacy sigue intacta (addInscripcion/importCrmEnrollment no se ven afectados)', () => {
    const harness = seededHarness()
    const legacy = harness.context.processRequest({
      action: 'addInscripcion', token: 'admin-token', idempotencyKey: 'ENR-LEGACY-2',
      inscripcion: { crmEnrollmentId: 'ENR-LEGACY-2', crmContactId: 'CTC-L2', crmCourseId: 'CRS-L2', courseTitle: 'Habilidades blandas para profesionales', modality: 'Virtual', participant: { fullName: 'Otra Persona', email: 'otra@example.com' }, amount: 25 },
    })
    expect(legacy.success).toBe(true)
    const retry = harness.context.processRequest({
      action: 'addInscripcion', token: 'admin-token', idempotencyKey: 'ENR-LEGACY-2',
      inscripcion: { crmEnrollmentId: 'ENR-LEGACY-2', crmContactId: 'CTC-L2', crmCourseId: 'CRS-L2', courseTitle: 'Habilidades blandas para profesionales', modality: 'Virtual', participant: { fullName: 'Otra Persona', email: 'otra@example.com' }, amount: 25 },
    })
    expect(retry).toEqual(legacy)
  })

  it('límite de batch: máximo 100 crmEnrollmentIds', () => {
    const harness = seededHarness()
    const muchos = Array.from({ length: 150 }, (_, i) => 'ENR-' + i)
    const result = crmCall(harness, 'getCrmEnrollmentCommerceStates', { crmEnrollmentIds: muchos })
    expect(result.data).toHaveLength(100)
  })
})
