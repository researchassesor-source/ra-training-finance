import { describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import { PNG } from 'pngjs'
import { createAppsScriptHarness } from './appsScriptHarness'

const FUTURE = '2099-01-01T00:00:00.000Z'
const CRM_TOKEN = 'crm-service-secreto-de-prueba'

function seededHarness() {
  const harness = createAppsScriptHarness()
  harness.seed('Sesiones', [
    { Token: 'admin-token', Username: 'admin.test', UserID: 'USR-A', Rol: 'admin', Nombre: 'Admin Test', Expira: FUTURE },
    { Token: 'integration-token', Username: 'crm.integration', UserID: 'USR-CRM', Rol: 'admin', Nombre: 'Integración CRM', Expira: FUTURE },
    { Token: 'aval-token', Username: 'aval.test', UserID: 'USR-I', Rol: 'aval', Nombre: 'Aval Test', Expira: FUTURE },
    { Token: 'aval-otro-token', Username: 'aval.otro', UserID: 'USR-I2', Rol: 'aval', Nombre: 'Aval Otro', Expira: FUTURE },
  ])
  harness.seed('Usuarios', [
    { ID: 'USR-A', Nombre: 'Admin Test', Username: 'admin.test', Rol: 'admin', Activo: true },
    { ID: 'USR-CRM', Nombre: 'Integración CRM', Username: 'crm.integration', Rol: 'admin', Activo: true },
    { ID: 'USR-I', Nombre: 'Aval Test', Username: 'aval.test', Rol: 'aval', Activo: true, InstitucionAval: 'ITSAL' },
    { ID: 'USR-I2', Nombre: 'Aval Otro', Username: 'aval.otro', Rol: 'aval', Activo: true, InstitucionAval: 'OTRA_INSTITUCION' },
  ])
  harness.seed('Servicios', [{ ID: 'SRV-1', Nombre: 'Habilidades blandas para profesionales', Modalidad: 'Virtual', Duracion: '60', Precio: 20, Activo: true }])
  harness.seed('AuditoriaCertificados', [])
  harness.seed('Certificados', [])
  harness.seed('Inscripciones', [])
  harness.seed('Ingresos', [])
  harness.seed('Pagos', [])
  harness.seed('CRMCompras', [])
  harness.seed('EntregablesAval', [])
  harness.properties.set('CRM_SERVICE_TOKEN', CRM_TOKEN)
  return harness
}

function crmCall(harness, action, params) {
  return harness.context.processRequest(Object.assign({ action, serviceToken: CRM_TOKEN }, params))
}
function inscripciones(harness) { return harness.objects('Inscripciones') }
function porId(harness, id) { return inscripciones(harness).find(r => r.ID === id) }
function compras(harness) { return harness.objects('CRMCompras') }

function activateCertificateSignatures(harness) {
  const image = new PNG({ width: 180, height: 60 })
  const noise = crypto.randomBytes(image.width * image.height * 3)
  for (let pixel = 0; pixel < image.width * image.height; pixel += 1) {
    image.data[pixel * 4] = noise[pixel * 3]
    image.data[pixel * 4 + 1] = noise[pixel * 3 + 1]
    image.data[pixel * 4 + 2] = noise[pixel * 3 + 2]
    image.data[pixel * 4 + 3] = 255
  }
  const pngBase64 = PNG.sync.write(image).toString('base64')
  const request = harness.context.processRequest
  for (const rol of ['director', 'manager']) {
    expect(request({ action: 'registrarFirmaOficialCertificado', token: 'admin-token', rol, pngBase64,
      confirmacion: 'CONFIRMO_FIRMA_AUTENTICA_Y_USO_AUTORIZADO' }).success).toBe(true)
  }
  expect(request({ action: 'activarPlantillaCertificadoV2', token: 'admin-token',
    confirmacion: 'ACTIVAR_CERTIFICADOS_SEGURIDAD_V2' }).success).toBe(true)
  expect(request({ action: 'guardarDatosFirmanteCertificado', token: 'admin-token', nombre: 'Mgs. Alexandra Villagómez',
    cargo: 'Gerente General', confirmacion: 'CONFIRMO_DATOS_OFICIALES_DE_FIRMA' }).success).toBe(true)
}

function institutionalSignatureBase64() {
  const image = new PNG({ width: 180, height: 60 })
  const noise = crypto.randomBytes(image.width * image.height * 3)
  for (let pixel = 0; pixel < image.width * image.height; pixel += 1) {
    image.data[pixel * 4] = noise[pixel * 3]
    image.data[pixel * 4 + 1] = noise[pixel * 3 + 1]
    image.data[pixel * 4 + 2] = noise[pixel * 3 + 2]
    image.data[pixel * 4 + 3] = 255
  }
  return PNG.sync.write(image).toString('base64')
}

function issueAndArchiveAval(harness, id) {
  activateCertificateSignatures(harness)
  const request = harness.context.processRequest
  const issued = request({ action: 'emitirEntregableAval', token: 'admin-token', id })
  expect(issued).toMatchObject({ success: true, data: { TemplateVersion: 'ra-institutional-aval-2026' } })
  const bytes = Buffer.from('%PDF-1.4 prueba sintética del archivo oficial')
  const hash = crypto.createHash('sha256').update(bytes).digest('hex')
  const archived = request({ action: 'guardarPdfEntregableAvalPrivado', token: 'admin-token', id,
    pdfBase64: bytes.toString('base64'), pdfHash: hash, templateVersion: 'ra-institutional-aval-2026' })
  expect(archived).toMatchObject({ success: true, hash })
  return { issued, bytes, hash }
}

function basePurchase(overrides) {
  return Object.assign({
    crmOrderId: 'ORD-1', crmEnrollmentId: 'ENR-1', crmContactId: 'CTC-1', crmCourseId: 'CRS-1',
    courseTitle: 'Habilidades blandas para profesionales', modality: 'Virtual',
    startDate: '2026-09-01', endDate: '2026-09-30',
    participant: { fullName: 'Ana Pérez', email: 'ana@example.com', phone: '0999999999', identification: '0102030405' },
    offerType: 'FULL', amount: 20, institucionAval: 'ITSAL',
  }, overrides)
}

describe('1. legacy importCrmEnrollment (via addInscripcion) sigue funcionando exactamente igual', () => {
  it('crea la inscripción legacy con Origen=CRM, sin CRMOfferType', () => {
    const harness = seededHarness()
    const result = harness.context.processRequest({
      action: 'addInscripcion', token: 'integration-token', idempotencyKey: 'ENR-LEGACY',
      inscripcion: { crmEnrollmentId: 'ENR-LEGACY', crmContactId: 'CTC-L', crmCourseId: 'CRS-L', courseTitle: 'Habilidades blandas para profesionales', modality: 'Virtual', participant: { fullName: 'Legacy Persona', email: 'legacy@example.com' }, amount: 30 },
    })
    expect(result.success).toBe(true)
    const row = porId(harness, result.id)
    expect(row.Origen).toBe('CRM')
    expect(row.CRMOfferType).toBe('')
  })
})

describe('2. retry legacy sigue usando CRMEnrollmentID como clave (no interfiere con CRMOrderID)', () => {
  it('reintentar la misma importCrmEnrollment devuelve el mismo ID sin usar CRMCompras', () => {
    const harness = seededHarness()
    const req = { action: 'addInscripcion', token: 'integration-token', idempotencyKey: 'ENR-LEGACY', inscripcion: { crmEnrollmentId: 'ENR-LEGACY', crmContactId: 'CTC-L', crmCourseId: 'CRS-L', courseTitle: 'Habilidades blandas para profesionales', modality: 'Virtual', participant: { fullName: 'Legacy Persona', email: 'legacy@example.com' }, amount: 30 } }
    const first = harness.context.processRequest(req)
    const retry = harness.context.processRequest(req)
    expect(retry).toEqual(first)
    expect(inscripciones(harness)).toHaveLength(1)
    expect(compras(harness)).toHaveLength(0)
  })
})

describe('3. importCrmPurchase usa CRMOrderID y no interfiere con el legacy', () => {
  it('importCrmPurchase para un enrollment NUEVO crea su propia inscripción, independiente del legacy', () => {
    const harness = seededHarness()
    harness.context.processRequest({ action: 'addInscripcion', token: 'integration-token', idempotencyKey: 'ENR-LEGACY', inscripcion: { crmEnrollmentId: 'ENR-LEGACY', crmContactId: 'CTC-L', crmCourseId: 'CRS-L', courseTitle: 'Habilidades blandas para profesionales', modality: 'Virtual', participant: { fullName: 'Legacy Persona', email: 'legacy@example.com' }, amount: 30 } })
    const result = crmCall(harness, 'importCrmPurchase', basePurchase())
    expect(result.success).toBe(true)
    expect(inscripciones(harness)).toHaveLength(2)
  })
})

describe('4. compra vinculada a un Enrollment que YA tiene Inscripción legacy la reutiliza (no duplica)', () => {
  it('importCrmPurchase FULL sobre un CRMEnrollmentID ya importado por importCrmEnrollment reutiliza esa misma Inscripción', () => {
    const harness = seededHarness()
    const legacy = harness.context.processRequest({ action: 'addInscripcion', token: 'integration-token', idempotencyKey: 'ENR-1', inscripcion: { crmEnrollmentId: 'ENR-1', crmContactId: 'CTC-1', crmCourseId: 'CRS-1', courseTitle: 'Habilidades blandas para profesionales', modality: 'Virtual', participant: { fullName: 'Ana Pérez', email: 'ana@example.com' }, amount: 20 } })
    const purchase = crmCall(harness, 'importCrmPurchase', basePurchase())
    expect(purchase.success).toBe(true)
    expect(purchase.data.financeInscripcionId).toBe(legacy.id)
    expect(inscripciones(harness)).toHaveLength(1)
  })
})

describe('5. FULL', () => {
  it('crea la compra con RequiereAvalExterno=true en su Inscripción', () => {
    const harness = seededHarness()
    const result = crmCall(harness, 'importCrmPurchase', basePurchase())
    expect(result.data.offerType).toBe('FULL')
    expect(result.data.requiresExternalAval).toBe(true)
  })

  it('retry con el mismo crmOrderId es idempotente, sin duplicar', () => {
    const harness = seededHarness()
    const primero = crmCall(harness, 'importCrmPurchase', basePurchase())
    const segundo = crmCall(harness, 'importCrmPurchase', basePurchase())
    expect(segundo.idempotent).toBe(true)
    expect(segundo.data.financeInscripcionId).toBe(primero.data.financeInscripcionId)
    expect(compras(harness)).toHaveLength(1)
  })
})

describe('6. INSTITUTIONAL', () => {
  it('RequiereAvalExterno=false', () => {
    const harness = seededHarness()
    const result = crmCall(harness, 'importCrmPurchase', basePurchase({ crmOrderId: 'ORD-INST', offerType: 'INSTITUTIONAL', amount: 10 }))
    expect(result.data.requiresExternalAval).toBe(false)
  })
})

describe('7. AVAL_UPGRADE con parent válido', () => {
  it('se vincula al parent, sin crear una segunda Inscripción', () => {
    const harness = seededHarness()
    const inst = crmCall(harness, 'importCrmPurchase', basePurchase({ crmOrderId: 'ORD-INST', offerType: 'INSTITUTIONAL', amount: 10 }))
    const upgrade = crmCall(harness, 'importCrmPurchase', basePurchase({ crmOrderId: 'ORD-UPG', offerType: 'AVAL_UPGRADE', parentCrmOrderId: 'ORD-INST', amount: 10 }))
    expect(upgrade.success).toBe(true)
    expect(upgrade.data.financeInscripcionId).toBe(inst.data.financeInscripcionId)
  })
})

describe('8. upgrade no crea Inscripción académica duplicada', () => {
  it('tras el upgrade, solo existe UNA fila en Inscripciones para el enrollment', () => {
    const harness = seededHarness()
    crmCall(harness, 'importCrmPurchase', basePurchase({ crmOrderId: 'ORD-INST', offerType: 'INSTITUTIONAL', amount: 10 }))
    crmCall(harness, 'importCrmPurchase', basePurchase({ crmOrderId: 'ORD-UPG', offerType: 'AVAL_UPGRADE', parentCrmOrderId: 'ORD-INST', amount: 10 }))
    const deEsteEnrollment = inscripciones(harness).filter(r => r.CRMEnrollmentID === 'ENR-1')
    expect(deEsteEnrollment).toHaveLength(1)
    expect(compras(harness)).toHaveLength(2)
  })

  it('upgrade sin parentCrmOrderId => rechazado', () => {
    const harness = seededHarness()
    const result = crmCall(harness, 'importCrmPurchase', basePurchase({ crmOrderId: 'ORD-UPG', offerType: 'AVAL_UPGRADE', amount: 10 }))
    expect(result.success).toBe(false)
  })

  it('upgrade con parent de otro contacto => rechazado', () => {
    const harness = seededHarness()
    crmCall(harness, 'importCrmPurchase', basePurchase({ crmOrderId: 'ORD-INST', offerType: 'INSTITUTIONAL', amount: 10 }))
    const result = crmCall(harness, 'importCrmPurchase', basePurchase({ crmOrderId: 'ORD-UPG', offerType: 'AVAL_UPGRADE', parentCrmOrderId: 'ORD-INST', amount: 10, crmContactId: 'CTC-OTRO' }))
    expect(result.success).toBe(false)
  })
})

describe('9/10. pago pendiente no concede derecho; pago verificado sí', () => {
  it('9. pendiente: no autoriza emisión de certificado', () => {
    const harness = seededHarness()
    const inst = crmCall(harness, 'importCrmPurchase', basePurchase({ crmOrderId: 'ORD-INST', offerType: 'INSTITUTIONAL', amount: 10 }))
    crmCall(harness, 'markCrmCourseCompleted', { crmEnrollmentId: 'ENR-1' })
    const emision = harness.context.processRequest({ action: 'emitirCertificado', token: 'admin-token', id: inst.data.financeInscripcionId })
    expect(emision.success).toBe(false)
  })

  it('10. paymentStatus reporta PAYMENT_VERIFIED tras verificarPagoCompraCrm, y sincroniza EstadoPago de la Inscripción', () => {
    const harness = seededHarness()
    const inst = crmCall(harness, 'importCrmPurchase', basePurchase({ crmOrderId: 'ORD-INST', offerType: 'INSTITUTIONAL', amount: 10 }))
    const verif = crmCall(harness, 'verificarPagoCompraCrm', { crmOrderId: 'ORD-INST', numeroComprobante: 'C-1', fechaPago: '2026-09-01' })
    expect(verif.data.paymentStatus).toBe('PAYMENT_VERIFIED')
    expect(porId(harness, inst.data.financeInscripcionId).EstadoPago).toBe('verificado')
  })
})

describe('8. no infiere offerType por amount (regresión explícita)', () => {
  it('FULL con monto atípico ($10) se guarda igual como FULL', () => {
    const harness = seededHarness()
    const result = crmCall(harness, 'importCrmPurchase', basePurchase({ offerType: 'FULL', amount: 10 }))
    expect(result.data.offerType).toBe('FULL')
    expect(result.data.requiresExternalAval).toBe(true)
  })
})

describe('11. completion obligatorio para el flujo comercial nuevo; legacy no queda bloqueado', () => {
  it('CRM_COMMERCE (CRMOfferType presente) no emite sin completion aunque el pago esté verificado', () => {
    const harness = seededHarness()
    const inst = crmCall(harness, 'importCrmPurchase', basePurchase({ crmOrderId: 'ORD-INST', offerType: 'INSTITUTIONAL', amount: 10 }))
    crmCall(harness, 'verificarPagoCompraCrm', { crmOrderId: 'ORD-INST', numeroComprobante: 'C-1', fechaPago: '2026-09-01' })
    const emision = harness.context.processRequest({ action: 'emitirCertificado', token: 'admin-token', id: inst.data.financeInscripcionId })
    expect(emision.success).toBe(false)
  })

  it('12. legacy (sin CRMOfferType) NO exige completion: pago verificado alcanza para emitir', () => {
    const harness = seededHarness()
    const legacy = harness.context.processRequest({
      action: 'addInscripcion', token: 'admin-token',
      inscripcion: { clienteNombre: 'Registro Manual', clienteID: '0601234560', clienteTipoIdentificacion: 'CEDULA_EC', servicioNombre: 'Habilidades blandas para profesionales', servicioId: 'SRV-1', modalidad: 'Virtual', fechaInicio: '2026-09-01', fechaFin: '2026-09-02', monto: 50, metodoPago: 'Efectivo', estadoPago: 'verificado' },
    })
    const emision = harness.context.processRequest({ action: 'emitirCertificado', token: 'admin-token', id: legacy.id })
    expect(emision.success).toBe(true)
  })
})

describe('13. INSTITUTIONAL no espera aval', () => {
  it('emite el certificado institucional con pago+completion, sin ningún registro de aval', () => {
    const harness = seededHarness()
    const inst = crmCall(harness, 'importCrmPurchase', basePurchase({ crmOrderId: 'ORD-INST', offerType: 'INSTITUTIONAL', amount: 10 }))
    crmCall(harness, 'verificarPagoCompraCrm', { crmOrderId: 'ORD-INST', numeroComprobante: 'C-1', fechaPago: '2026-09-01' })
    crmCall(harness, 'markCrmCourseCompleted', { crmEnrollmentId: 'ENR-1' })
    const emision = harness.context.processRequest({ action: 'emitirCertificado', token: 'admin-token', id: inst.data.financeInscripcionId })
    expect(emision.success).toBe(true)
  })
})

describe('14. FULL no entrega avalado antes de la aprobación', () => {
  it('el certificado institucional se emite, pero EntregablesAval no existe hasta marcarAval', () => {
    const harness = seededHarness()
    const full = crmCall(harness, 'importCrmPurchase', basePurchase())
    crmCall(harness, 'verificarPagoCompraCrm', { crmOrderId: 'ORD-1', numeroComprobante: 'C-1', fechaPago: '2026-09-01' })
    crmCall(harness, 'markCrmCourseCompleted', { crmEnrollmentId: 'ENR-1' })
    const emision = harness.context.processRequest({ action: 'emitirCertificado', token: 'admin-token', id: full.data.financeInscripcionId })
    expect(emision.success).toBe(true)
    expect(harness.objects('EntregablesAval').find(e => e.InscripcionID === full.data.financeInscripcionId)).toBeUndefined()
  })
})

describe('15. upgrade reutiliza el certificado institucional (no lo duplica)', () => {
  it('tras aplicar el upgrade, la Inscripción padre sigue con un único Certificado', () => {
    const harness = seededHarness()
    const inst = crmCall(harness, 'importCrmPurchase', basePurchase({ crmOrderId: 'ORD-INST', offerType: 'INSTITUTIONAL', amount: 10 }))
    crmCall(harness, 'verificarPagoCompraCrm', { crmOrderId: 'ORD-INST', numeroComprobante: 'C-1', fechaPago: '2026-09-01' })
    crmCall(harness, 'markCrmCourseCompleted', { crmEnrollmentId: 'ENR-1' })
    harness.context.processRequest({ action: 'emitirCertificado', token: 'admin-token', id: inst.data.financeInscripcionId })

    crmCall(harness, 'importCrmPurchase', basePurchase({ crmOrderId: 'ORD-UPG', offerType: 'AVAL_UPGRADE', parentCrmOrderId: 'ORD-INST', amount: 10 }))
    crmCall(harness, 'verificarPagoCompraCrm', { crmOrderId: 'ORD-UPG', numeroComprobante: 'C-2', fechaPago: '2026-09-05' })

    const padre = porId(harness, inst.data.financeInscripcionId)
    expect(padre.RequiereAvalExterno).toBe(true)
    expect(harness.objects('Certificados').filter(c => c.InscripcionID === padre.ID)).toHaveLength(1)
  })
})

describe('marcarAval + entregable avalado', () => {
  function facturaFullLista(harness, { institutionName = 'ITSAL', institutionSiglas = 'ITSAL' } = {}) {
    const request = harness.context.processRequest
    const institution = request({ action: 'addInstitucionMaestra', token: 'admin-token', institucion: {
      nombre: institutionName, siglas: institutionSiglas, tipo: 'Instituto', identificacion: '0691783737001',
      tipoIdentificacion: 'RUC_EC', ciudad: 'Riobamba', estado: 'activo',
    } })
    expect(institution.success).toBe(true)
    const agreement = request({ action: 'addConvenio', token: 'admin-token', convenio: {
      institucionId: institution.id, objeto: `Convenio de aval ${institutionName} para prueba`, estado: 'activo',
      porcentajeAval: '15', baseCalculoAval: 'precio_servicio',
    } })
    expect(agreement.success).toBe(true)
    const authority = request({ action: 'addAutoridadInstitucion', token: 'admin-token', institucionId: institution.id,
      autoridad: { nombre: `Autoridad de ${institutionName}`, cargo: 'Directora Académica', funcion: 'Autoridad firmante',
        firmaCertificados: true, estado: 'activo' } })
    expect(authority.success).toBe(true)
    const signature = request({ action: 'addActivoInstitucion', token: 'admin-token', institucionId: institution.id,
      autoridadId: authority.id, tipo: 'firma', archivo: { nombreArchivo: 'firma-autoridad.png', mimeType: 'image/png', base64: institutionalSignatureBase64() } })
    expect(signature.success).toBe(true)
    const assignedUser = request({ action: 'updateUsuario', token: 'admin-token', id: 'USR-I', usuario: {
      roles: ['aval'], institucionAvalId: institution.id, institucionAval: institutionName,
    } })
    expect(assignedUser.success).toBe(true)

    const full = crmCall(harness, 'importCrmPurchase', basePurchase({ institucionAval: institutionName }))
    const linked = request({ action: 'updateInscripcion', token: 'admin-token', id: full.data.financeInscripcionId, inscripcion: {
      institucionAvalId: institution.id, convenioId: agreement.id, requiereAvalExterno: true,
    } })
    expect(linked.success).toBe(true)
    crmCall(harness, 'verificarPagoCompraCrm', { crmOrderId: 'ORD-1', numeroComprobante: 'C-1', fechaPago: '2026-09-01' })
    crmCall(harness, 'markCrmCourseCompleted', { crmEnrollmentId: 'ENR-1' })
    request({ action: 'emitirCertificado', token: 'admin-token', id: full.data.financeInscripcionId })
    return full.data.financeInscripcionId
  }

  it('no prepara un certificado con aval antes de la fecha de fin académica', () => {
    const harness = seededHarness()
    const id = facturaFullLista(harness)
    const sheet = harness.sheets.Inscripciones
    const endColumn = harness.sourceHeaders('Inscripciones').indexOf('FechaFin')
    const inscriptionRow = sheet.rows.find(row => row[0] === id)
    inscriptionRow[endColumn] = '2099-12-31'

    const request = harness.context.processRequest
    expect(request({ action: 'marcarAval', token: 'aval-token', id, avalCodigoExterno: 'ITSAL-2026-123' }).success).toBe(true)
    activateCertificateSignatures(harness)
    const result = request({ action: 'emitirEntregableAval', token: 'admin-token', id })
    expect(result).toMatchObject({ success: false })
    expect(result.error).toMatch(/todavía no ha terminado/)
    expect(harness.objects('EntregablesAval')[0].CodigoCertificado).toBeFalsy()
  })

  function certificadoNormalInstitucionalConUpgradePendiente(harness) {
    const request = harness.context.processRequest
    const institution = request({ action: 'addInstitucionMaestra', token: 'admin-token', institucion: {
      nombre: 'Instituto Posterior', siglas: 'IP', tipo: 'Instituto', identificacion: '1790012345001',
      tipoIdentificacion: 'RUC_EC', ciudad: 'Quito', estado: 'activo',
    } })
    expect(institution.success).toBe(true)
    const agreement = request({ action: 'addConvenio', token: 'admin-token', convenio: {
      institucionId: institution.id, objeto: 'Convenio de aval posterior para prueba', estado: 'activo',
      porcentajeAval: '15', baseCalculoAval: 'precio_servicio',
    } })
    expect(agreement.success).toBe(true)
    const authority = request({ action: 'addAutoridadInstitucion', token: 'admin-token', institucionId: institution.id,
      autoridad: { nombre: 'Autoridad Posterior', cargo: 'Directora Académica', funcion: 'Autoridad firmante',
        firmaCertificados: true, estado: 'activo' } })
    expect(authority.success).toBe(true)
    expect(request({ action: 'addActivoInstitucion', token: 'admin-token', institucionId: institution.id,
      autoridadId: authority.id, tipo: 'firma', archivo: { nombreArchivo: 'firma-posterior.png', mimeType: 'image/png', base64: institutionalSignatureBase64() } }).success).toBe(true)
    expect(request({ action: 'updateUsuario', token: 'admin-token', id: 'USR-I', usuario: {
      roles: ['aval'], institucionAvalId: institution.id, institucionAval: 'Instituto Posterior',
    } }).success).toBe(true)

    const parent = crmCall(harness, 'importCrmPurchase', basePurchase({
      crmOrderId: 'ORD-POST-ISSUE', offerType: 'INSTITUTIONAL', amount: 10,
    }))
    expect(parent.success).toBe(true)
    const id = parent.data.financeInscripcionId
    expect(crmCall(harness, 'verificarPagoCompraCrm', { crmOrderId: 'ORD-POST-ISSUE', numeroComprobante: 'PARENT-1', fechaPago: '2026-09-01' }).success).toBe(true)
    expect(crmCall(harness, 'markCrmCourseCompleted', { crmEnrollmentId: 'ENR-1' }).success).toBe(true)
    expect(request({ action: 'emitirCertificado', token: 'admin-token', id }).success).toBe(true)
    const normal = harness.objects('Certificados').find(item => item.InscripcionID === id)
    expect(normal).toBeTruthy()

    const upgrade = crmCall(harness, 'importCrmPurchase', basePurchase({
      crmOrderId: 'ORD-POST-ISSUE-UPGRADE', offerType: 'AVAL_UPGRADE', parentCrmOrderId: 'ORD-POST-ISSUE', amount: 5,
    }))
    expect(upgrade.success).toBe(true)
    expect(upgrade.data.financeInscripcionId).toBe(id)
    return { id, institutionId: institution.id, agreementId: agreement.id, normal, upgradeOrderId: 'ORD-POST-ISSUE-UPGRADE' }
  }

  function certificadoNormalManualSinAval(harness, participant = 'Ana Pérez') {
    const request = harness.context.processRequest
    const institution = request({ action: 'addInstitucionMaestra', token: 'admin-token', institucion: {
      nombre: 'Instituto Aval Manual', siglas: 'IAM', tipo: 'Instituto', identificacion: '1790012345001',
      tipoIdentificacion: 'RUC_EC', ciudad: 'Quito', estado: 'activo',
    } })
    expect(institution.success).toBe(true)
    const agreement = request({ action: 'addConvenio', token: 'admin-token', convenio: {
      institucionId: institution.id, objeto: 'Convenio vigente para aval manual', estado: 'activo',
      porcentajeAval: '15', baseCalculoAval: 'precio_servicio',
    } })
    expect(agreement.success).toBe(true)
    const authority = request({ action: 'addAutoridadInstitucion', token: 'admin-token', institucionId: institution.id,
      autoridad: { nombre: 'Autoridad Manual', cargo: 'Directora Académica', funcion: 'Autoridad firmante',
        firmaCertificados: true, estado: 'activo' } })
    expect(authority.success).toBe(true)
    expect(request({ action: 'addActivoInstitucion', token: 'admin-token', institucionId: institution.id,
      autoridadId: authority.id, tipo: 'firma', archivo: { nombreArchivo: 'firma-manual.png', mimeType: 'image/png',
        base64: institutionalSignatureBase64() } }).success).toBe(true)
    expect(request({ action: 'updateUsuario', token: 'admin-token', id: 'USR-I', usuario: {
      roles: ['aval'], institucionAvalId: institution.id, institucionAval: 'Instituto Aval Manual',
    } }).success).toBe(true)
    const enrollment = request({ action: 'addInscripcion', token: 'admin-token', inscripcion: {
      clienteNombre: participant, clienteID: 'P12345678', clienteTipoIdentificacion: 'PASAPORTE',
      clienteEmail: 'ana@example.com', servicioId: 'SRV-1', servicioNombre: 'Habilidades blandas para profesionales',
      modalidad: 'Virtual', fechaInicio: '2026-09-01', fechaFin: '2026-09-30', monto: 20,
      metodoPago: 'efectivo', estadoPago: 'verificado',
    } })
    expect(enrollment.success).toBe(true)
    expect(request({ action: 'emitirCertificado', token: 'admin-token', id: enrollment.id }).success).toBe(true)
    const original = harness.objects('Certificados').find(item => item.InscripcionID === enrollment.id)
    expect(original).toBeTruthy()
    return { id: enrollment.id, institutionId: institution.id, agreementId: agreement.id, original }
  }

  it('marcarAval confirmado crea el entregable en EntregablesAval, no una segunda fila en Certificados', () => {
    const harness = seededHarness()
    const id = facturaFullLista(harness)
    const aval = harness.context.processRequest({ action: 'marcarAval', token: 'aval-token', id, avalReferencia: 'REF-1' })
    expect(aval.success).toBe(true)
    const entregable = harness.objects('EntregablesAval').find(e => e.InscripcionID === id)
    expect(entregable.EstadoValidacionExterna).toBe('avalado')
    expect(entregable.EstadoEntregaFinal).toBe('pendiente_envio')
    expect(harness.objects('Certificados').filter(c => c.InscripcionID === id)).toHaveLength(1)
  })

  it('Bloque 7: un upgrade posterior verificado agrega un avalado independiente y conserva el normal, historial y verificación pública', () => {
    const harness = seededHarness()
    const request = harness.context.processRequest
    const setup = certificadoNormalInstitucionalConUpgradePendiente(harness)

    const beforePayment = request({ action: 'configurarAvalPosteriorCertificado', token: 'admin-token', id: setup.id,
      institucionId: setup.institutionId, convenioId: setup.agreementId, confirmacion: 'CONFIGURAR_AVAL_POSTERIOR' })
    expect(beforePayment.success).toBe(false)
    expect(beforePayment.error).toMatch(/aval posterior pendiente de configuración/i)
    expect(porId(harness, setup.id).InstitucionID).toBe('')

    expect(request({ action: 'configurarAvalPosteriorCertificado', token: 'aval-token', id: setup.id,
      institucionId: setup.institutionId, convenioId: setup.agreementId, confirmacion: 'CONFIGURAR_AVAL_POSTERIOR' }).success).toBe(false)
    expect(crmCall(harness, 'verificarPagoCompraCrm', { crmOrderId: setup.upgradeOrderId, numeroComprobante: 'UPGRADE-1', fechaPago: '2026-09-05' }).success).toBe(true)

    const originalNormal = harness.objects('Certificados').find(item => item.InscripcionID === setup.id)
    expect(originalNormal).toEqual(setup.normal)
    const genericMutation = request({ action: 'updateInscripcion', token: 'admin-token', id: setup.id,
      inscripcion: { requiereAvalExterno: false, institucionAvalId: 'INSTITUCION_FORZADA', convenioId: 'CONVENIO_FORZADO' } })
    expect(genericMutation.success).toBe(false)
    expect(harness.objects('Certificados').find(item => item.InscripcionID === setup.id)).toEqual(originalNormal)

    const configured = request({ action: 'configurarAvalPosteriorCertificado', token: 'admin-token', id: setup.id,
      institucionId: setup.institutionId, convenioId: setup.agreementId, confirmacion: 'CONFIGURAR_AVAL_POSTERIOR' })
    expect(configured).toMatchObject({ success: true, alreadyConfigured: false, data: { institutionName: 'Instituto Posterior' } })
    expect(request({ action: 'configurarAvalPosteriorCertificado', token: 'admin-token', id: setup.id,
      institucionId: setup.institutionId, convenioId: setup.agreementId, confirmacion: 'CONFIGURAR_AVAL_POSTERIOR' }))
      .toMatchObject({ success: true, alreadyConfigured: true })
    expect(harness.objects('Certificados').find(item => item.InscripcionID === setup.id)).toEqual(originalNormal)
    const unauthorizedConfiguration = request({ action: 'configurarAvalPosteriorCertificado', token: 'aval-token', id: setup.id,
      institucionId: setup.institutionId, convenioId: setup.agreementId, confirmacion: 'CONFIGURAR_AVAL_POSTERIOR' })
    expect(unauthorizedConfiguration.success).toBe(false)
    expect(porId(harness, setup.id).InstitucionID).toBe(setup.institutionId)

    const configuredRow = request({ action: 'getCertificadosAval', token: 'admin-token' }).data.find(item => item.ID === setup.id)
    expect(configuredRow).toMatchObject({ PuedeConfigurarAvalPosterior: false, AvalUpgradeVerificado: true,
      CertificadoNormal: { ID: originalNormal.ID, CodigoCertificado: originalNormal.CodigoCertificado, CertificateStatus: 'emitido' } })
    expect(request({ action: 'marcarAval', token: 'aval-token', id: setup.id, avalReferencia: 'POST-ISSUE-REF', avalCodigoExterno: 'IP-2026-01' }).success).toBe(true)
    expect(request({ action: 'marcarAval', token: 'aval-token', id: setup.id, avalReferencia: 'POST-ISSUE-REF', avalCodigoExterno: 'IP-2026-01' }).success).toBe(true)
    expect(harness.objects('EntregablesAval').filter(item => item.InscripcionID === setup.id)).toHaveLength(1)

    const { issued } = issueAndArchiveAval(harness, setup.id)
    const normalAfter = harness.objects('Certificados').find(item => item.InscripcionID === setup.id)
    const avalAfter = harness.objects('EntregablesAval').find(item => item.InscripcionID === setup.id)
    expect(normalAfter).toEqual(originalNormal)
    expect(avalAfter.ID).not.toBe(normalAfter.ID)
    expect(avalAfter.CodigoCertificado).not.toBe(normalAfter.CodigoCertificado)
    expect(avalAfter.PdfHash).toBeTruthy()
    expect(harness.objects('Inscripciones').filter(item => item.ID === setup.id)).toHaveLength(1)
    expect(harness.objects('Certificados').filter(item => item.InscripcionID === setup.id)).toHaveLength(1)
    expect(harness.objects('EntregablesAval').filter(item => item.InscripcionID === setup.id)).toHaveLength(1)

    expect(request({ action: 'verificarCertificado', id: normalAfter.ID })).toMatchObject({
      valido: true, data: { tipoDocumento: 'certificado_normal', codigo: normalAfter.CodigoCertificado },
    })
    expect(request({ action: 'verificarCertificado', id: normalAfter.CodigoCertificado })).toMatchObject({
      valido: true, data: { tipoDocumento: 'certificado_normal', codigo: normalAfter.CodigoCertificado },
    })
    expect(request({ action: 'verificarCertificado', id: avalAfter.ID })).toMatchObject({
      valido: true, data: { tipoDocumento: 'certificado_avalado', codigo: issued.data.CodigoCertificado },
    })
    expect(request({ action: 'verificarCertificado', id: avalAfter.CodigoCertificado })).toMatchObject({
      valido: true, data: { tipoDocumento: 'certificado_avalado', codigo: issued.data.CodigoCertificado },
    })
    expect(harness.objects('AuditoriaCertificados').map(item => item.Accion)).toEqual(expect.arrayContaining([
      'POST_ISSUE_AVAL_CONFIGURED', 'AVAL_CONFIRMED', 'AVAL_CERTIFICATE_PREPARED', 'AVAL_CERTIFICATE_PDF_ARCHIVED',
    ]))
  })

  it('permite un aval posterior Finance autorizado sin cobro, sin cambiar el certificado emitido', () => {
    const harness = seededHarness()
    const request = harness.context.processRequest
    const setup = certificadoNormalManualSinAval(harness)
    const candidates = request({ action: 'buscarCertificadosParaAvalPosterior', token: 'admin-token',
      q: setup.original.CodigoCertificado })
    expect(candidates).toMatchObject({ success: true, data: [{ ID: setup.id, OrigenCRM: false,
      PuedeConfigurarAvalPosterior: true }] })
    expect(request({ action: 'buscarCertificadosParaAvalPosterior', token: 'aval-token', q: 'Ana' }).success).toBe(false)
    const args = { action: 'configurarAvalPosteriorCertificado', token: 'admin-token', id: setup.id,
      institucionId: setup.institutionId, convenioId: setup.agreementId,
      confirmacion: 'CONFIGURAR_AVAL_POSTERIOR', motivo: 'Aval posterior autorizado expresamente por gerencia.' }
    expect(request(args).success).toBe(false)
    expect(request({ ...args, sinCobroAutorizado: true })).toMatchObject({ success: true, alreadyConfigured: false })
    expect(request({ ...args, sinCobroAutorizado: true })).toMatchObject({ success: true, alreadyConfigured: true })
    expect(harness.objects('Certificados').find(item => item.InscripcionID === setup.id)).toEqual(setup.original)
    expect(request({ action: 'marcarAval', token: 'aval-token', id: setup.id,
      avalReferencia: 'MANUAL-AVAL', avalCodigoExterno: 'IAM-2026-1' }).success).toBe(true)
    issueAndArchiveAval(harness, setup.id)
    expect(harness.objects('Certificados').find(item => item.InscripcionID === setup.id)).toEqual(setup.original)
    expect(harness.objects('EntregablesAval').filter(item => item.InscripcionID === setup.id)).toHaveLength(1)
    expect(request({ action: 'buscarCertificadosParaAvalPosterior', token: 'admin-token',
      q: setup.original.CodigoCertificado }).data).toHaveLength(0)
    const audit = harness.objects('AuditoriaCertificados').find(item => item.Accion === 'POST_ISSUE_AVAL_CONFIGURED')
    expect(audit.Motivo).toMatch(/gerencia/)
    expect(JSON.parse(audit.Metadatos)).toMatchObject({ origenAvalPosterior: 'finance_manual', sinCobroAutorizado: true })
  })

  it('buscar un certificado histórico no crea filas en Certificados', () => {
    const harness = seededHarness()
    const setup = certificadoNormalManualSinAval(harness)
    harness.sheets.Certificados.rows.splice(1)
    const before = harness.objects('Inscripciones').find(item => item.ID === setup.id)
    const result = harness.context.processRequest({ action: 'buscarCertificadosParaAvalPosterior',
      token: 'admin-token', q: setup.original.CodigoCertificado })
    expect(result).toMatchObject({ success: true, data: [{ ID: setup.id }] })
    expect(harness.objects('Certificados')).toHaveLength(0)
    expect(harness.objects('Inscripciones').find(item => item.ID === setup.id)).toEqual(before)
  })

  it('exige ingreso adicional confirmado y evita reutilizarlo para otro aval', () => {
    const harness = seededHarness()
    const request = harness.context.processRequest
    const first = certificadoNormalManualSinAval(harness)
    const secondEnrollment = request({ action: 'addInscripcion', token: 'admin-token', inscripcion: {
      clienteNombre: 'Ana Pérez', clienteID: 'P12345678', clienteTipoIdentificacion: 'PASAPORTE',
      clienteEmail: 'ana@example.com', servicioId: 'SRV-1', servicioNombre: 'Habilidades blandas para profesionales',
      modalidad: 'Virtual', fechaInicio: '2026-09-01', fechaFin: '2026-09-30', monto: 20,
      metodoPago: 'efectivo', estadoPago: 'verificado',
    } })
    expect(secondEnrollment.success).toBe(true)
    expect(request({ action: 'emitirCertificado', token: 'admin-token', id: secondEnrollment.id }).success).toBe(true)
    const income = request({ action: 'addIngreso', token: 'admin-token', ingreso: {
      fecha: '2026-10-01', tipo: 'curso', modalidad: 'Virtual', concepto: 'Aval posterior de Ana Pérez',
      cliente: 'Ana Pérez', monto: 8, metodoPago: 'efectivo', estado: 'confirmado',
    } })
    expect(income.success).toBe(true)
    const args = { action: 'configurarAvalPosteriorCertificado', token: 'admin-token',
      institucionId: first.institutionId, convenioId: first.agreementId,
      confirmacion: 'CONFIGURAR_AVAL_POSTERIOR', motivo: 'Cobro adicional de aval posterior verificado por administración.',
      ingresoAvalId: income.id }
    expect(request({ ...args, id: first.id }).success).toBe(true)
    expect(porId(harness, first.id).AvalIngresoID).toBe(income.id)
    expect(request({ action: 'updateIngreso', token: 'admin-token', id: income.id, ingreso: {
      fecha: '2026-10-01', tipo: 'curso', modalidad: 'Virtual', concepto: 'Otro concepto',
      cliente: 'Ana Pérez', monto: 1, metodoPago: 'efectivo', estado: 'confirmado',
    } }).error).toMatch(/aval posterior.*protegido/)
    expect(request({ action: 'deleteIngreso', token: 'admin-token', id: income.id }).error).toMatch(/aval posterior/)
    expect(request({ ...args, id: secondEnrollment.id }).error).toMatch(/ya se vinculó a otro aval/)
    expect(porId(harness, secondEnrollment.id).RequiereAvalExterno).toBe(false)
  })

  it('Bloque 7: normal V2 y avalado V2 versionan de forma independiente sobre una sola raíz', () => {
    const harness = seededHarness()
    const request = harness.context.processRequest
    const setup = certificadoNormalInstitucionalConUpgradePendiente(harness)
    crmCall(harness, 'verificarPagoCompraCrm', { crmOrderId: setup.upgradeOrderId, numeroComprobante: 'UPGRADE-VERSIONS', fechaPago: '2026-09-06' })
    expect(request({ action: 'configurarAvalPosteriorCertificado', token: 'admin-token', id: setup.id,
      institucionId: setup.institutionId, convenioId: setup.agreementId, confirmacion: 'CONFIGURAR_AVAL_POSTERIOR' }).success).toBe(true)
    expect(request({ action: 'marcarAval', token: 'aval-token', id: setup.id, avalReferencia: 'VERSION-REF', avalCodigoExterno: 'VERSION-CODE' }).success).toBe(true)
    const { issued: avalV1 } = issueAndArchiveAval(harness, setup.id)
    const normalV1Before = harness.objects('Certificados').find(item => item.InscripcionID === setup.id)
    const avalV1Before = harness.objects('EntregablesAval').find(item => item.InscripcionID === setup.id)

    const normalV2 = request({ action: 'reemitirCertificado', token: 'admin-token', id: setup.id,
      motivo: 'Corrección independiente del certificado normal', confirmacion: 'REEMITIR' })
    expect(normalV2).toMatchObject({ success: true, data: { CertificateVersion: 2, CertificateStatus: 'pendiente_pdf' } })
    expect(normalV2.data.ID).not.toBe(avalV1.data.ID)
    expect(harness.objects('EntregablesAval').find(item => item.InscripcionID === setup.id)).toEqual(avalV1Before)
    const normalPdf = Buffer.from('%PDF-1.4 normal version 2')
    const normalHash = crypto.createHash('sha256').update(normalPdf).digest('hex')
    expect(request({ action: 'registrarArtefactoCertificado', token: 'admin-token', id: normalV2.data.ID,
      pdfHash: normalHash, pdfStorageReference: `test-memory:${normalV2.data.ID}:normal-v2`,
      templateVersion: normalV2.data.TemplateVersion, certificateVersion: 2 }).success).toBe(true)
    expect(harness.objects('Certificados').find(item => item.ID === normalV1Before.ID).CertificateStatus).toBe('reemitido')
    expect(request({ action: 'verificarCertificado', id: normalV2.data.ID })).toMatchObject({
      valido: true, data: { tipoDocumento: 'certificado_normal', version: 2 },
    })
    expect(harness.objects('EntregablesAval').find(item => item.ID === avalV1.data.ID)).toEqual(avalV1Before)

    const avalV2 = request({ action: 'reemitirEntregableAval', token: 'admin-token', id: setup.id,
      motivo: 'Corrección independiente del certificado avalado', confirmacion: 'REEMITIR' })
    expect(avalV2).toMatchObject({ success: true, data: { CertificateVersion: 2, CertificateStatus: 'pendiente_pdf' } })
    expect(avalV2.data.ID).not.toBe(normalV2.data.ID)
    const avalPdf = Buffer.from('%PDF-1.4 endorsed version 2')
    const avalHash = crypto.createHash('sha256').update(avalPdf).digest('hex')
    expect(request({ action: 'guardarPdfEntregableAvalPrivado', token: 'admin-token', id: setup.id,
      pdfBase64: avalPdf.toString('base64'), pdfHash: avalHash, templateVersion: avalV2.data.TemplateVersion }).success).toBe(true)

    expect(harness.objects('Inscripciones').filter(item => item.ID === setup.id)).toHaveLength(1)
    expect(harness.objects('Certificados').filter(item => item.InscripcionID === setup.id)).toHaveLength(2)
    expect(harness.objects('EntregablesAval').filter(item => item.InscripcionID === setup.id)).toHaveLength(2)
    expect(request({ action: 'verificarCertificado', id: normalV2.data.ID })).toMatchObject({
      valido: true, data: { tipoDocumento: 'certificado_normal', codigo: normalV2.data.CodigoCertificado, version: 2 },
    })
    expect(request({ action: 'verificarCertificado', id: avalV1.data.ID }).data).toMatchObject({
      tipoDocumento: 'certificado_avalado', estado: 'reemitido', certificadoVigenteId: avalV2.data.ID,
    })
    expect(request({ action: 'verificarCertificado', id: avalV2.data.ID })).toMatchObject({
      valido: true, data: { tipoDocumento: 'certificado_avalado', codigo: avalV2.data.CodigoCertificado, version: 2 },
    })
    expect(harness.objects('Certificados').find(item => item.ID === normalV2.data.ID)).toMatchObject({ CertificateStatus: 'emitido', PdfHash: normalHash })
  })

  it('Bloque 7: rechaza un upgrade verificado vinculado a otro padre/raíz sin alterar el certificado original', () => {
    const harness = seededHarness()
    const setup = certificadoNormalInstitucionalConUpgradePendiente(harness)
    crmCall(harness, 'verificarPagoCompraCrm', { crmOrderId: setup.upgradeOrderId, numeroComprobante: 'UPGRADE-2', fechaPago: '2026-09-05' })
    const purchases = harness.sheets.CRMCompras
    const headers = harness.sourceHeaders('CRMCompras')
    const upgradeRow = purchases.rows.find(row => row[headers.indexOf('CRMOrderID')] === setup.upgradeOrderId)
    upgradeRow[headers.indexOf('ParentCRMOrderID')] = 'ORD-OTHER-PARENT'

    const rejected = harness.context.processRequest({ action: 'configurarAvalPosteriorCertificado', token: 'admin-token', id: setup.id,
      institucionId: setup.institutionId, convenioId: setup.agreementId, confirmacion: 'CONFIGURAR_AVAL_POSTERIOR' })
    expect(rejected.success).toBe(false)
    expect(rejected.error).toMatch(/upgrade.*verificado/i)
    expect(porId(harness, setup.id).InstitucionID).toBe('')
    expect(harness.objects('Certificados').find(item => item.InscripcionID === setup.id)).toEqual(setup.normal)
  })

  it('18. aval de otra institución sigue bloqueado', () => {
    const harness = seededHarness()
    const id = facturaFullLista(harness)
    const intento = harness.context.processRequest({ action: 'marcarAval', token: 'aval-otro-token', id, avalReferencia: 'REF-X' })
    expect(intento.success).toBe(false)
  })

  it('19. retries de entrega final no duplican el envío', () => {
    const harness = seededHarness()
    const id = facturaFullLista(harness)
    harness.context.processRequest({ action: 'marcarAval', token: 'aval-token', id, avalReferencia: 'REF-1', avalCodigoExterno: 'ITSAL-1' })
    expect(harness.context.processRequest({ action: 'enviarEntregableAvalEmail', token: 'admin-token', id }).success).toBe(false)
    issueAndArchiveAval(harness, id)
    let enviosReales = 0
    harness.context.MailApp = { sendEmail: () => { enviosReales += 1 } }
    const primero = harness.context.processRequest({ action: 'enviarEntregableAvalEmail', token: 'admin-token', id })
    const segundo = harness.context.processRequest({ action: 'enviarEntregableAvalEmail', token: 'admin-token', id })
    expect(primero.success).toBe(true)
    expect(segundo.alreadySent).toBe(true)
    expect(enviosReales).toBe(1)
  })

  it('el envío incierto exige reconciliación humana antes de reintentar', () => {
    const harness = seededHarness()
    const id = facturaFullLista(harness)
    const request = harness.context.processRequest
    request({ action: 'marcarAval', token: 'aval-token', id, avalCodigoExterno: 'ITSAL-2026-123' })
    issueAndArchiveAval(harness, id)
    let attempts = 0
    harness.context.MailApp = { sendEmail: () => { attempts += 1; throw new Error('fallo incierto') } }
    expect(request({ action: 'enviarEntregableAvalEmail', token: 'admin-token', id }).success).toBe(false)
    expect(request({ action: 'enviarEntregableAvalEmail', token: 'admin-token', id }).success).toBe(false)
    expect(attempts).toBe(1)
    expect(request({ action: 'resolverEnvioEntregableAval', token: 'aval-token', id,
      resultado: 'no_enviado', motivo: 'Confirmado en enviados', confirmacion: 'RECONCILIAR_ENVIO_AVAL' }).success).toBe(false)
    expect(request({ action: 'resolverEnvioEntregableAval', token: 'admin-token', id,
      resultado: 'no_enviado', motivo: 'Confirmado en enviados', confirmacion: 'RECONCILIAR_ENVIO_AVAL' }).data.estado).toBe('pendiente_envio')
    harness.context.MailApp = { sendEmail: () => { attempts += 1 } }
    expect(request({ action: 'enviarEntregableAvalEmail', token: 'admin-token', id }).success).toBe(true)
    expect(attempts).toBe(2)
  })

  it('ITSAL: ni el rol aval ni el admin pueden emitir antes de las firmas; el QR combina ambos códigos solo tras archivar', () => {
    const harness = seededHarness()
    const id = facturaFullLista(harness)
    const request = harness.context.processRequest
    expect(request({ action: 'marcarAval', token: 'aval-token', id, avalReferencia: 'REF-1', avalCodigoExterno: 'ITSAL-2026-123' }).success).toBe(true)
    expect(request({ action: 'emitirEntregableAval', token: 'aval-token', id }).success).toBe(false)
    expect(request({ action: 'emitirEntregableAval', token: 'admin-token', id }).success).toBe(false)
    activateCertificateSignatures(harness)
    const issued = request({ action: 'emitirEntregableAval', token: 'admin-token', id })
    expect(issued.data).toMatchObject({ CertificateSubject: 'institutional_aval', AvalCodigoExterno: 'ITSAL-2026-123',
      TemplateVersion: 'ra-institutional-aval-2026', InstitutionData: { name: 'ITSAL', authorityName: 'Autoridad de ITSAL',
        authorityRole: 'Directora Académica', managerName: 'Mgs. Alexandra Villagómez', managerTitle: 'Gerente General' } })
    expect(request({ action: 'emitirEntregableAval', token: 'admin-token', id }).alreadyPrepared).toBe(true)
    expect(issued.data.CertificateStatus).toBe('pendiente_pdf')
    expect(request({ action: 'verificarCertificado', id: issued.data.ID }).valido).toBe(false)
    const bytes = Buffer.from('%PDF-1.4 prueba sintética del archivo oficial')
    const hash = crypto.createHash('sha256').update(bytes).digest('hex')
    expect(request({ action: 'guardarPdfEntregableAvalPrivado', token: 'aval-token', id,
      pdfBase64: bytes.toString('base64'), pdfHash: hash, templateVersion: issued.data.TemplateVersion }).success).toBe(false)
    expect(request({ action: 'guardarPdfEntregableAvalPrivado', token: 'admin-token', id,
      pdfBase64: bytes.toString('base64'), pdfHash: 'f'.repeat(64), templateVersion: issued.data.TemplateVersion }).success).toBe(false)
    expect(harness.objects('EntregablesAval')[0].CertificateStatus).toBe('pendiente_pdf')
    expect(request({ action: 'guardarPdfEntregableAvalPrivado', token: 'admin-token', id,
      pdfBase64: bytes.toString('base64'), pdfHash: hash, templateVersion: issued.data.TemplateVersion }).success).toBe(true)
    expect(harness.objects('EntregablesAval')[0].CertificateStatus).toBe('emitido')
    const publicResult = request({ action: 'verificarCertificado', id: issued.data.ID })
    expect(publicResult).toMatchObject({ valido: true, data: { codigo: issued.data.CodigoCertificado, avalCodigoExterno: 'ITSAL-2026-123' } })
    expect(request({ action: 'leerPdfEntregableAvalPrivado', token: 'aval-token', id }).success).toBe(false)
  })

  it('usa el diseño aprobado solo si la ficha conserva logo y resolución auténticos', () => {
    const harness = seededHarness()
    const id = facturaFullLista(harness)
    const request = harness.context.processRequest
    const institution = harness.objects('Instituciones')[0]
    expect(request({ action: 'updateInstitucionMaestra', token: 'admin-token', id: institution.ID,
      institucion: { nombre: institution.Nombre, siglas: institution.Siglas, tipo: institution.Tipo,
        identificacion: institution.Identificacion, tipoIdentificacion: institution.TipoIdentificacion,
        ciudad: institution.Ciudad, estado: 'activo', codigoResolucion: 'RPC-SO-22-No.364-2024' } }).success).toBe(true)
    expect(request({ action: 'addActivoInstitucion', token: 'admin-token', institucionId: institution.ID,
      tipo: 'logo', archivo: { nombreArchivo: 'logo-institucional.png', mimeType: 'image/png',
        base64: institutionalSignatureBase64() } }).success).toBe(true)
    expect(request({ action: 'marcarAval', token: 'aval-token', id,
      avalCodigoExterno: 'ITSA-1231243' }).success).toBe(true)
    activateCertificateSignatures(harness)
    const issued = request({ action: 'emitirEntregableAval', token: 'admin-token', id })
    expect(issued).toMatchObject({ success: true, data: {
      TemplateVersion: 'ra-institutional-aval-2026-v2',
      InstitutionData: { resolutionCode: 'RPC-SO-22-No.364-2024' },
    } })
    expect(request({ action: 'getFirmasOficialesCertificado', token: 'admin-token',
      templateVersion: 'ra-institutional-aval-2026-v2',
      managerSignatureSha256: issued.data.InstitutionData.managerSignatureSha256 }).success).toBe(true)
  })

  it('un aval ITSAL nuevo congela la firma de Gerencia v3 y no reutiliza la v2', () => {
    const harness = seededHarness()
    const id = facturaFullLista(harness)
    const request = harness.context.processRequest
    expect(request({ action: 'marcarAval', token: 'aval-token', id,
      avalCodigoExterno: 'ITSAL-2026-V3' }).success).toBe(true)
    activateCertificateSignatures(harness)
    const v2 = request({ action: 'getFirmasOficialesCertificado', token: 'admin-token',
      templateVersion: 'ra-security-2026-v2' })
    expect(v2.success).toBe(true)
    for (const rol of ['director', 'manager']) {
      expect(request({ action: 'registrarFirmaOficialCertificado', token: 'admin-token', rol,
        pngBase64: institutionalSignatureBase64(), version: 'v3',
        confirmacion: 'CONFIRMO_FIRMA_AUTENTICA_Y_USO_AUTORIZADO' }).success).toBe(true)
    }
    expect(request({ action: 'activarPlantillaCertificadoV3', token: 'admin-token',
      confirmacion: 'ACTIVAR_CERTIFICADOS_SEGURIDAD_V3' }).success).toBe(true)
    const v3 = request({ action: 'getFirmasOficialesCertificado', token: 'admin-token',
      templateVersion: 'ra-security-2026-v3' })
    expect(v3.success).toBe(true)
    expect(v3.signers.manager.signatureSha256).not.toBe(v2.signers.manager.signatureSha256)

    const issued = request({ action: 'emitirEntregableAval', token: 'admin-token', id })
    expect(issued).toMatchObject({ success: true, data: { TemplateVersion: 'ra-institutional-aval-2026',
      InstitutionData: { managerSignatureSha256: v3.signers.manager.signatureSha256 } } })
    const resolved = request({ action: 'getFirmasOficialesCertificado', token: 'admin-token',
      templateVersion: issued.data.TemplateVersion,
      managerSignatureSha256: issued.data.InstitutionData.managerSignatureSha256 })
    expect(resolved.success).toBe(true)
    expect(resolved.signatures.manager).toBe(v3.signatures.manager)
    expect(harness.objects('EntregablesAval')[0].CertificateManagerSignatureSha256)
      .toBe(v3.signers.manager.signatureSha256)
  })

  it('emite para cualquier institución maestra vinculada y congela los datos aunque luego cambie la ficha', () => {
    const harness = seededHarness()
    const id = facturaFullLista(harness, { institutionName: 'Instituto Delta', institutionSiglas: 'ID' })
    const request = harness.context.processRequest
    expect(request({ action: 'marcarAval', token: 'aval-token', id, avalCodigoExterno: 'DELTA-2026-045' }).success).toBe(true)
    activateCertificateSignatures(harness)
    const issued = request({ action: 'emitirEntregableAval', token: 'admin-token', id })
    expect(issued).toMatchObject({ success: true, data: { TemplateVersion: 'ra-institutional-aval-2026',
      AvalCodigoExterno: 'DELTA-2026-045', InstitutionData: { name: 'Instituto Delta', siglas: 'ID',
        agreementObject: 'Convenio de aval Instituto Delta para prueba', authorityName: 'Autoridad de Instituto Delta' } } })

    const snapshot = issued.data.InstitutionData
    const institutionId = snapshot.institutionId
    expect(request({ action: 'updateInstitucionMaestra', token: 'admin-token', id: institutionId,
      institucion: { nombre: 'Instituto Delta Renombrado', siglas: 'IDR', tipo: 'Instituto', identificacion: '0691783737001',
        tipoIdentificacion: 'RUC_EC', ciudad: 'Riobamba', estado: 'activo' } }).success).toBe(true)
    const retry = request({ action: 'emitirEntregableAval', token: 'admin-token', id })
    expect(retry.alreadyPrepared).toBe(true)
    expect(retry.data.InstitutionData).toEqual(snapshot)
    expect(request({ action: 'getCertificadosAval', token: 'admin-token' }).data.find(row => row.ID === id).EntregableAval)
      .toMatchObject({ TemplateVersion: 'ra-institutional-aval-2026', CertificateStatus: 'pendiente_pdf' })
  })

  it('envía el correo del PDF oficial con la institución y el código externo correctos para una entidad no ITSAL', () => {
    const harness = seededHarness()
    const id = facturaFullLista(harness, { institutionName: 'Instituto Delta', institutionSiglas: 'ID' })
    const request = harness.context.processRequest
    request({ action: 'marcarAval', token: 'aval-token', id, avalCodigoExterno: 'DELTA-2026-045' })
    issueAndArchiveAval(harness, id)
    let email
    harness.context.MailApp = { sendEmail: message => { email = message } }

    expect(request({ action: 'enviarEntregableAvalEmail', token: 'admin-token', id }).success).toBe(true)
    expect(email.body).toContain('aval institucional de Instituto Delta')
    expect(email.body).toContain('Código externo del aval: DELTA-2026-045')
    expect(email.body).not.toContain('ITSAL')
    expect(email.attachments).toHaveLength(1)
  })

  it('no emite si el convenio no pertenece a la institución ligada al aval', () => {
    const harness = seededHarness()
    const id = facturaFullLista(harness)
    const other = harness.context.processRequest({ action: 'addInstitucionMaestra', token: 'admin-token', institucion: {
      nombre: 'Instituto Separado', siglas: 'IS', tipo: 'Instituto', identificacion: '1790012345001',
      tipoIdentificacion: 'RUC_EC', ciudad: 'Quito', estado: 'activo',
    } })
    const otherAgreement = harness.context.processRequest({ action: 'addConvenio', token: 'admin-token', convenio: {
      institucionId: other.id, objeto: 'Convenio distinto', estado: 'activo', porcentajeAval: '10', baseCalculoAval: 'precio_servicio',
    } })
    harness.context.processRequest({ action: 'marcarAval', token: 'aval-token', id, avalCodigoExterno: 'ITSAL-2026-123' })
    const enrollment = harness.objects('Inscripciones').find(row => row.ID === id)
    harness.sheets.Inscripciones.getRange(2, 1, 1, harness.sourceHeaders('Inscripciones').length)
      .setValues([harness.sourceHeaders('Inscripciones').map(header => header === 'AvalConvenioID' ? otherAgreement.id : enrollment[header] ?? '')])
    activateCertificateSignatures(harness)
    const rejected = harness.context.processRequest({ action: 'emitirEntregableAval', token: 'admin-token', id })
    expect(rejected.success).toBe(false)
    expect(rejected.error).toMatch(/convenio confirmado/i)
  })

  it('la ficha de firma externa debe ser única y verificable antes de emitir', () => {
    const harness = seededHarness()
    const id = facturaFullLista(harness)
    const authority = harness.objects('AutoridadesInstitucion')[0]
    harness.context.processRequest({ action: 'addAutoridadInstitucion', token: 'admin-token', institucionId: authority.InstitucionID,
      autoridad: { nombre: 'Autoridad duplicada', cargo: 'Rector', firmaCertificados: true, estado: 'activo' } })
    harness.context.processRequest({ action: 'marcarAval', token: 'aval-token', id, avalCodigoExterno: 'ITSAL-2026-123' })
    activateCertificateSignatures(harness)
    const rejected = harness.context.processRequest({ action: 'emitirEntregableAval', token: 'admin-token', id })
    expect(rejected.success).toBe(false)
    expect(rejected.error).toMatch(/más de una autoridad/i)
  })

  it('versiona el certificado institucional genérico sin retirar el vigente antes de archivar el PDF nuevo', () => {
    const harness = seededHarness()
    const id = facturaFullLista(harness)
    const request = harness.context.processRequest
    request({ action: 'marcarAval', token: 'aval-token', id, avalCodigoExterno: 'ITSAL-2026-123' })
    const { issued } = issueAndArchiveAval(harness, id)
    const oldId = issued.data.ID
    const sourceEnrollment = porId(harness, id)
    const confirmedEconomics = Object.fromEntries(['ValorAval', 'AvalMontoBase', 'AvalPorcentajeAplicado', 'AvalBaseTipoAplicado', 'AvalMontoCalculado', 'AvalConfirmadoPor']
      .map(key => [key, sourceEnrollment[key]]))
    const sourceDeliverable = harness.objects('EntregablesAval').find(row => row.ID === oldId)
    const institutionalSnapshot = Object.fromEntries(Object.entries(sourceDeliverable)
      .filter(([key]) => key.startsWith('CertificateInstitution') || key.startsWith('CertificateAgreement')))
    const next = request({ action: 'reemitirEntregableAval', token: 'admin-token', id,
      motivo: 'Corrección de presentación', confirmacion: 'REEMITIR' })
    expect(next).toMatchObject({ success: true, data: { CertificateStatus: 'pendiente_pdf', CertificateVersion: 2,
      TemplateVersion: 'ra-institutional-aval-2026' } })
    expect(next.data.ID).not.toBe(oldId)
    expect(request({ action: 'reemitirEntregableAval', token: 'admin-token', id,
      motivo: 'Corrección de presentación', confirmacion: 'REEMITIR' })).toMatchObject({
      success: true, alreadyPrepared: true, data: { ID: next.data.ID },
    })
    expect(request({ action: 'reemitirEntregableAval', token: 'admin-token', id,
      motivo: 'Motivo cambiado durante el reintento', confirmacion: 'REEMITIR' }).success).toBe(false)
    expect(harness.objects('EntregablesAval')).toHaveLength(2)
    expect(request({ action: 'verificarCertificado', id: oldId }).data.estado).toBe('vigente')
    expect(request({ action: 'verificarCertificado', id: next.data.ID }).valido).toBe(false)
    const bytes = Buffer.from('%PDF-1.4 aval genérico v2\n%%EOF')
    const hash = crypto.createHash('sha256').update(bytes).digest('hex')
    const auditSheet = harness.ensureSheet('AuditoriaCertificados')
    const appendRow = auditSheet.appendRow.bind(auditSheet)
    auditSheet.appendRow = () => { throw new Error('audit unavailable') }
    const rejectedArchive = request({ action: 'guardarPdfEntregableAvalPrivado', token: 'admin-token', id,
      pdfBase64: bytes.toString('base64'), pdfHash: hash,
      templateVersion: 'ra-institutional-aval-2026' })
    expect(rejectedArchive.success).toBe(false)
    expect(harness.objects('EntregablesAval').find(row => row.ID === oldId)).toMatchObject({ CertificateStatus: 'emitido', ReissuedCertificateId: '' })
    expect(harness.objects('EntregablesAval').find(row => row.ID === next.data.ID)).toMatchObject({
      CertificateStatus: 'pendiente_pdf', PdfHash: '', PdfStorageReference: '',
    })
    expect([...harness.driveFiles.values()].some(file => file.getName().includes('_v2.pdf'))).toBe(false)
    expect([...harness.driveFiles.values()].some(file => file.getName().includes('_v1.pdf'))).toBe(true)
    auditSheet.appendRow = appendRow
    expect(request({ action: 'guardarPdfEntregableAvalPrivado', token: 'admin-token', id,
      pdfBase64: bytes.toString('base64'), pdfHash: hash,
      templateVersion: 'ra-institutional-aval-2026' }).success).toBe(true)
    expect(request({ action: 'verificarCertificado', id: oldId }).data).toMatchObject({
      estado: 'reemitido', certificadoVigenteId: next.data.ID,
    })
    expect(request({ action: 'verificarCertificado', id: next.data.ID }).data).toMatchObject({ estado: 'vigente', version: 2 })
    expect(porId(harness, id)).toMatchObject(confirmedEconomics)
    expect(harness.objects('EntregablesAval').find(row => row.ID === next.data.ID)).toMatchObject(institutionalSnapshot)
  })

  it('conserva V1 ITSAL y prepara V2 con la plantilla institucional vigente; cambia el QR solo al archivar', () => {
    const harness = seededHarness()
    const id = facturaFullLista(harness)
    const request = harness.context.processRequest
    request({ action: 'marcarAval', token: 'aval-token', id, avalCodigoExterno: 'ITSAL-2026-123' })
    const { issued } = issueAndArchiveAval(harness, id)
    const oldId = issued.data.ID
    const headers = harness.sheets.EntregablesAval.rows[0]
    const previousRow = harness.sheets.EntregablesAval.rows.find(row => row[headers.indexOf('ID')] === oldId)
    previousRow[headers.indexOf('TemplateVersion')] = 'ra-itsal-security-2026-v1'
    previousRow[headers.indexOf('CodigoCertificado')] = 'RA-ITSAL-LEGACY-001'
    const next = request({ action: 'reemitirEntregableAval', token: 'admin-token', id,
      motivo: 'Corrección histórica', confirmacion: 'REEMITIR' })
    expect(next).toMatchObject({ success: true, data: { CertificateVersion: 2,
      TemplateVersion: 'ra-institutional-aval-2026' } })
    expect(harness.objects('EntregablesAval').find(row => row.ID === oldId).TemplateVersion).toBe('ra-itsal-security-2026-v1')
    expect(next.data.ID).not.toBe(oldId)
    expect(request({ action: 'reemitirEntregableAval', token: 'admin-token', id,
      motivo: 'Corrección histórica', confirmacion: 'REEMITIR' })).toMatchObject({
      success: true, alreadyPrepared: true, data: { ID: next.data.ID },
    })
    expect(request({ action: 'verificarCertificado', id: oldId }).data.estado).toBe('vigente')
    expect(request({ action: 'verificarCertificado', id: next.data.ID }).valido).toBe(false)
    const bytes = Buffer.from('%PDF-1.4 segunda versión sintética')
    const hash = crypto.createHash('sha256').update(bytes).digest('hex')
    expect(request({ action: 'guardarPdfEntregableAvalPrivado', token: 'admin-token', id,
      pdfBase64: bytes.toString('base64'), pdfHash: hash,
      templateVersion: 'ra-institutional-aval-2026' }).success).toBe(true)
    expect(request({ action: 'verificarCertificado', id: oldId }).data).toMatchObject({ estado: 'reemitido', certificadoVigenteId: next.data.ID })
    expect(request({ action: 'verificarCertificado', id: next.data.ID }).data).toMatchObject({ estado: 'vigente', version: 2 })
    expect(harness.objects('EntregablesAval')).toHaveLength(2)
    expect(harness.objects('Certificados')).toHaveLength(1)
  })

  it('congela V1, toma firmantes actuales para V2 y corrige la identificación sin tocar el aval económico', () => {
    const harness = seededHarness()
    const request = harness.context.processRequest
    const id = facturaFullLista(harness)
    const normalV1 = harness.objects('Certificados').find(row => row.InscripcionID === id)
    expect(request({ action: 'registrarArtefactoCertificado', token: 'admin-token', id: normalV1.ID,
      pdfHash: 'a'.repeat(64), pdfStorageReference: `test-memory:${normalV1.ID}:v1`,
      templateVersion: normalV1.TemplateVersion, certificateVersion: 1 }).success).toBe(true)
    expect(request({ action: 'marcarAval', token: 'aval-token', id, avalCodigoExterno: 'ITSAL-V1' }).success).toBe(true)
    const { issued } = issueAndArchiveAval(harness, id)
    const avalV1 = harness.objects('EntregablesAval').find(row => row.ID === issued.data.ID)
    const economics = Object.fromEntries(['AvalMontoBase', 'AvalPorcentajeAplicado', 'AvalMontoCalculado', 'ValorAval']
      .map(key => [key, porId(harness, id)[key]]))
    const authority = harness.objects('AutoridadesInstitucion')[0]
    expect(request({ action: 'updateAutoridadInstitucion', token: 'admin-token', id: authority.ID,
      autoridad: { nombre: 'Nueva Autoridad ITSAL', cargo: 'Directora General', funcion: 'Autoridad firmante',
        firmaCertificados: true, estado: 'activo' } }).success).toBe(true)
    expect(request({ action: 'guardarDatosFirmanteCertificado', token: 'admin-token',
      nombre: 'Mgs. Alexandra Villagómez', cargo: 'Gerente General Actual',
      confirmacion: 'CONFIRMO_DATOS_OFICIALES_DE_FIRMA' }).success).toBe(true)
    for (const rol of ['director', 'manager']) {
      expect(request({ action: 'registrarFirmaOficialCertificado', token: 'admin-token', rol,
        pngBase64: institutionalSignatureBase64(), version: 'v3',
        confirmacion: 'CONFIRMO_FIRMA_AUTENTICA_Y_USO_AUTORIZADO' }).success).toBe(true)
    }
    expect(request({ action: 'activarPlantillaCertificadoV3', token: 'admin-token',
      confirmacion: 'ACTIVAR_CERTIFICADOS_SEGURIDAD_V3' }).success).toBe(true)
    expect(request({ action: 'corregirIdentificacionAvalConfirmado', token: 'aval-token', id,
      identificacionAnterior: '0102030405', identificacionNueva: '0601234560', tipoIdentificacion: 'CEDULA_EC',
      motivo: 'Corrección documentada de cédula', confirmacion: 'CORREGIR_IDENTIFICACION_AVAL' }).success).toBe(false)
    expect(request({ action: 'corregirIdentificacionAvalConfirmado', token: 'admin-token', id,
      identificacionAnterior: '0102030405', identificacionNueva: 601234560, tipoIdentificacion: 'CEDULA_EC',
      motivo: 'Corrección documentada de cédula', confirmacion: 'CORREGIR_IDENTIFICACION_AVAL' }).success).toBe(false)
    expect(request({ action: 'corregirIdentificacionAvalConfirmado', token: 'admin-token', id,
      identificacionAnterior: '0102030405', identificacionNueva: '0601234567', tipoIdentificacion: 'CEDULA_EC',
      motivo: 'Corrección documentada de cédula', confirmacion: 'CORREGIR_IDENTIFICACION_AVAL' }).success).toBe(false)
    const auditSheet = harness.ensureSheet('AuditoriaCertificados')
    const appendAudit = auditSheet.appendRow.bind(auditSheet)
    auditSheet.appendRow = () => { throw new Error('Auditoría temporalmente no disponible') }
    expect(request({ action: 'corregirIdentificacionAvalConfirmado', token: 'admin-token', id,
      identificacionAnterior: '0102030405', identificacionNueva: '0601234560', tipoIdentificacion: 'CEDULA_EC',
      motivo: 'Corrección documentada de cédula', confirmacion: 'CORREGIR_IDENTIFICACION_AVAL' }).success).toBe(false)
    expect(porId(harness, id).ClienteID).toBe('0102030405')
    auditSheet.appendRow = appendAudit
    const correction = request({ action: 'corregirIdentificacionAvalConfirmado', token: 'admin-token', id,
      identificacionAnterior: '0102030405', identificacionNueva: '0601234560', tipoIdentificacion: 'CEDULA_EC',
      motivo: 'Corrección documentada de cédula', confirmacion: 'CORREGIR_IDENTIFICACION_AVAL' })
    expect(correction).toMatchObject({ success: true, data: { identificacion: '0601234560', requiereReemisionAval: true } })
    expect(request({ action: 'getCertificadosAval', token: 'admin-token' }).data.find(row => row.ID === id).ClienteID).toBe('0601234560')
    expect(request({ action: 'emitirEntregableAval', token: 'admin-token', id }).data.ClienteID).toBe('0102030405')
    expect(request({ action: 'enviarCertificadoEmail', token: 'admin-token', id }).error).toMatch(/Reemita y archive una versión normal nueva/i)
    expect(request({ action: 'enviarEntregableAvalEmail', token: 'admin-token', id }).error).toMatch(/Reemita y archive una versión avalada nueva/i)
    const normalV2 = request({ action: 'reemitirCertificado', token: 'admin-token', id,
      motivo: 'Cédula corregida según documento presentado', confirmacion: 'REEMITIR' })
    expect(normalV2).toMatchObject({ success: true, data: { ClienteID: '0601234560', CertificateVersion: 2 } })
    expect(request({ action: 'registrarArtefactoCertificado', token: 'admin-token', id: normalV2.data.ID,
      pdfHash: 'b'.repeat(64), pdfStorageReference: `test-memory:${normalV2.data.ID}:v2`,
      templateVersion: normalV2.data.TemplateVersion, certificateVersion: 2 }).success).toBe(true)
    const avalV2 = request({ action: 'reemitirEntregableAval', token: 'admin-token', id,
      motivo: 'Cédula corregida con nueva autoridad', confirmacion: 'REEMITIR' })
    expect(avalV2).toMatchObject({ success: true, data: { ClienteID: '0601234560', CertificateVersion: 2,
      InstitutionData: { authorityName: 'Nueva Autoridad ITSAL', managerTitle: 'Gerente General Actual' } } })
    expect(avalV2.data.InstitutionData.managerSignatureSha256).not.toBe(issued.data.InstitutionData.managerSignatureSha256)
    expect(harness.objects('EntregablesAval').find(row => row.ID === avalV1.ID)).toEqual(avalV1)
    expect(JSON.parse(harness.objects('EntregablesAval').find(row => row.ID === avalV2.data.ID).DocumentSnapshot).datos.participante.ClienteID)
      .toBe('0601234560')
    expect(porId(harness, id)).toMatchObject(economics)
    expect(harness.objects('Certificados').find(row => row.ID === normalV1.ID).DocumentSnapshot).toBe(normalV1.DocumentSnapshot)
  })

  it('revierte la preparación si no se puede registrar su auditoría obligatoria', () => {
    const harness = seededHarness()
    const id = facturaFullLista(harness)
    const request = harness.context.processRequest
    request({ action: 'marcarAval', token: 'aval-token', id, avalCodigoExterno: 'ITSAL-2026-123' })
    activateCertificateSignatures(harness)
    const auditSheet = harness.ensureSheet('AuditoriaCertificados')
    const appendRow = auditSheet.appendRow.bind(auditSheet)
    auditSheet.appendRow = () => { throw new Error('audit unavailable') }

    const rejected = request({ action: 'emitirEntregableAval', token: 'admin-token', id })
    expect(rejected.success).toBe(false)
    const row = harness.objects('EntregablesAval')[0]
    expect(row).toMatchObject({ CertificateStatus: '', CodigoCertificado: '', TemplateVersion: '', CertificateInstitutionId: '' })

    auditSheet.appendRow = appendRow
    expect(request({ action: 'emitirEntregableAval', token: 'admin-token', id }))
      .toMatchObject({ success: true, data: { CertificateStatus: 'pendiente_pdf' } })
  })

  it('revierte el PDF privado y deja pendiente_pdf si falla la auditoría de archivo', () => {
    const harness = seededHarness()
    const id = facturaFullLista(harness)
    const request = harness.context.processRequest
    request({ action: 'marcarAval', token: 'aval-token', id, avalCodigoExterno: 'ITSAL-2026-123' })
    activateCertificateSignatures(harness)
    const issued = request({ action: 'emitirEntregableAval', token: 'admin-token', id })
    expect(issued.success).toBe(true)
    const bytes = Buffer.from('%PDF-1.4 rollback archive test')
    const hash = crypto.createHash('sha256').update(bytes).digest('hex')
    const auditSheet = harness.ensureSheet('AuditoriaCertificados')
    const appendRow = auditSheet.appendRow.bind(auditSheet)
    auditSheet.appendRow = () => { throw new Error('audit unavailable') }

    const rejected = request({ action: 'guardarPdfEntregableAvalPrivado', token: 'admin-token', id,
      pdfBase64: bytes.toString('base64'), pdfHash: hash, templateVersion: issued.data.TemplateVersion })
    expect(rejected.success).toBe(false)
    expect(harness.objects('EntregablesAval')[0]).toMatchObject({ CertificateStatus: 'pendiente_pdf', PdfHash: '', PdfStorageReference: '', IssuedAt: '' })
    expect([...harness.driveFiles.values()].some(file => file.getName().startsWith('CERT_AVAL_'))).toBe(false)

    auditSheet.appendRow = appendRow
    expect(request({ action: 'guardarPdfEntregableAvalPrivado', token: 'admin-token', id,
      pdfBase64: bytes.toString('base64'), pdfHash: hash, templateVersion: issued.data.TemplateVersion }).success).toBe(true)
  })

  it('ITSAL: anulación auditada deja el PDF histórico verificable como no vigente', () => {
    const harness = seededHarness()
    const id = facturaFullLista(harness)
    const request = harness.context.processRequest
    request({ action: 'marcarAval', token: 'aval-token', id, avalCodigoExterno: 'ITSAL-2026-123' })
    const { issued } = issueAndArchiveAval(harness, id)
    expect(request({ action: 'anularEntregableAval', token: 'aval-token', id,
      motivo: 'Corrección necesaria', confirmacion: 'ANULAR' }).success).toBe(false)
    expect(request({ action: 'anularEntregableAval', token: 'admin-token', id,
      motivo: 'Corrección necesaria', confirmacion: 'ANULAR' }).success).toBe(true)
    expect(request({ action: 'verificarCertificado', id: issued.data.ID }).data.estado).toBe('anulado')
    expect(request({ action: 'enviarEntregableAvalEmail', token: 'admin-token', id }).success).toBe(false)
    expect(harness.objects('AuditoriaCertificados').map(row => row.Accion)).toContain('AVAL_CERTIFICATE_VOIDED')
  })

  it('el aval repetido es idempotente y el entregable enviado bloquea cambios históricos', () => {
    const harness = seededHarness()
    const id = facturaFullLista(harness)
    const params = { action: 'marcarAval', token: 'aval-token', id, avalReferencia: 'REF-1', avalCodigoExterno: 'COD-1' }
    expect(harness.context.processRequest(params).success).toBe(true)
    const auditorias = harness.objects('AuditoriaCertificados').filter(e => e.Accion === 'AVAL_CONFIRMED').length
    const repetido = harness.context.processRequest(params)
    expect(repetido.alreadyConfirmed).toBe(true)
    expect(harness.objects('AuditoriaCertificados').filter(e => e.Accion === 'AVAL_CONFIRMED')).toHaveLength(auditorias)

    issueAndArchiveAval(harness, id)
    harness.context.MailApp = { sendEmail: () => {} }
    expect(harness.context.processRequest({ action: 'enviarEntregableAvalEmail', token: 'admin-token', id }).success).toBe(true)
    const cambio = harness.context.processRequest({ ...params, avalCodigoExterno: 'COD-2' })
    expect(cambio.success).toBe(false)
    expect(harness.objects('Inscripciones').find(row => row.ID === id).AvalCodigoExterno).toBe('COD-1')
    expect(harness.context.processRequest(params).alreadyConfirmed).toBe(true)
  })
})

describe('16. datos sensibles no se filtran en getCrmPurchaseStatuses', () => {
  it('no expone RUC, dirección fiscal ni teléfono', () => {
    const harness = seededHarness()
    crmCall(harness, 'importCrmPurchase', basePurchase())
    const result = crmCall(harness, 'getCrmPurchaseStatuses', { crmOrderIds: ['ORD-1'] })
    const keys = Object.keys(result.data[0])
    expect(keys).not.toContain('RUC')
    expect(keys).not.toContain('DireccionFactura')
    expect(keys).not.toContain('ClienteTelefono')
  })
})

describe('17. retries idempotentes (completion sync)', () => {
  it('markCrmCourseCompleted repetido no duplica auditoría ni cambia CompletedAt', () => {
    const harness = seededHarness()
    crmCall(harness, 'importCrmPurchase', basePurchase())
    const primero = crmCall(harness, 'markCrmCourseCompleted', { crmEnrollmentId: 'ENR-1' })
    const completedAt1 = porId(harness, primero.data.inscripcionId).CRMCompletedAt
    const auditoriaAntes = harness.objects('AuditoriaCertificados').filter(e => e.Accion === 'CRM_COMPLETION_CONFIRMED').length
    crmCall(harness, 'markCrmCourseCompleted', { crmEnrollmentId: 'ENR-1' })
    expect(porId(harness, primero.data.inscripcionId).CRMCompletedAt).toBe(completedAt1)
    expect(harness.objects('AuditoriaCertificados').filter(e => e.Accion === 'CRM_COMPLETION_CONFIRMED').length).toBe(auditoriaAntes)
  })

  it('verificarPagoCompraCrm repetido no reescribe FechaVerificacionPago', () => {
    const harness = seededHarness()
    crmCall(harness, 'importCrmPurchase', basePurchase({ crmOrderId: 'ORD-INST', offerType: 'INSTITUTIONAL', amount: 10 }))
    const primero = crmCall(harness, 'verificarPagoCompraCrm', { crmOrderId: 'ORD-INST', numeroComprobante: 'C-1', fechaPago: '2026-09-01' })
    const segundo = crmCall(harness, 'verificarPagoCompraCrm', { crmOrderId: 'ORD-INST', numeroComprobante: 'C-1', fechaPago: '2026-09-01' })
    expect(segundo.alreadyVerified).toBe(true)
    expect(segundo.data.paymentVerifiedAt).toBe(primero.data.paymentVerifiedAt)
  })
})

describe('18. batch status respeta límite y rechaza lista vacía', () => {
  it('crmOrderIds vacío es rechazado', () => {
    const harness = seededHarness()
    const result = crmCall(harness, 'getCrmPurchaseStatuses', { crmOrderIds: [] })
    expect(result.success).toBe(false)
  })
})

describe('19. participant.identification: null no bloquea el import ni produce el string "null"', () => {
  it('acepta identification=null y guarda ClienteID como cadena vacía, no "null"', () => {
    const harness = seededHarness()
    const result = crmCall(harness, 'importCrmPurchase', basePurchase({
      participant: { fullName: 'Sin Cédula', email: 'sincedula@example.com', phone: '0999999999', identification: null },
    }))
    expect(result.success).toBe(true)
    const row = porId(harness, result.data.financeInscripcionId)
    expect(row.ClienteID).toBe('')
    expect(row.ClienteID).not.toBe('null')
    expect(row.ClienteNombre).toBe('Sin Cédula')
  })

  it('acepta identification ausente por completo (participant sin la clave)', () => {
    const harness = seededHarness()
    const result = crmCall(harness, 'importCrmPurchase', basePurchase({
      crmOrderId: 'ORD-SIN-ID', crmEnrollmentId: 'ENR-SIN-ID',
      participant: { fullName: 'Sin Clave', email: 'sinclave@example.com' },
    }))
    expect(result.success).toBe(true)
    const row = porId(harness, result.data.financeInscripcionId)
    expect(row.ClienteID).toBe('')
  })
})

describe('20. serviceToken válido autentica acciones comerciales incluso con un campo token legacy co-presente', () => {
  it('un token legacy (de sesión humana) en el mismo payload no interfiere con la autenticación por serviceToken', () => {
    const harness = seededHarness()
    const result = harness.context.processRequest(Object.assign(
      { action: 'importCrmPurchase', serviceToken: CRM_TOKEN, token: 'integration-token' },
      basePurchase(),
    ))
    expect(result.success).toBe(true)
  })

  it('un token legacy inválido/expirado en el mismo payload tampoco interfiere (serviceToken manda)', () => {
    const harness = seededHarness()
    const result = harness.context.processRequest(Object.assign(
      { action: 'importCrmPurchase', serviceToken: CRM_TOKEN, token: 'token-inexistente-o-vencido' },
      basePurchase({ crmOrderId: 'ORD-TOKEN-2', crmEnrollmentId: 'ENR-TOKEN-2' }),
    ))
    expect(result.success).toBe(true)
  })

  it('serviceToken AUSENTE + token legacy admin válido => REJECT (sin fallback a sesión legacy)', () => {
    const harness = seededHarness()
    const result = harness.context.processRequest(Object.assign(
      { action: 'importCrmPurchase', token: 'integration-token' },
      basePurchase({ crmOrderId: 'ORD-TOKEN-3', crmEnrollmentId: 'ENR-TOKEN-3' }),
    ))
    expect(result).toEqual({ success: false, error: 'Token de servicio CRM inválido o no configurado.' })
  })

  it('serviceToken inválido + token legacy admin válido => REJECT', () => {
    const harness = seededHarness()
    const result = harness.context.processRequest(Object.assign(
      { action: 'importCrmPurchase', serviceToken: 'token-falso', token: 'integration-token' },
      basePurchase({ crmOrderId: 'ORD-TOKEN-4', crmEnrollmentId: 'ENR-TOKEN-4' }),
    ))
    expect(result).toEqual({ success: false, error: 'Token de servicio CRM inválido o no configurado.' })
  })

  it('serviceToken y token ambos ausentes => REJECT', () => {
    const harness = seededHarness()
    const result = harness.context.processRequest(Object.assign(
      { action: 'importCrmPurchase' },
      basePurchase({ crmOrderId: 'ORD-TOKEN-5', crmEnrollmentId: 'ENR-TOKEN-5' }),
    ))
    expect(result).toEqual({ success: false, error: 'Token de servicio CRM inválido o no configurado.' })
  })

  it('la regla estricta se aplica a las demás acciones service-to-service del grupo CRM (no solo importCrmPurchase)', () => {
    const harness = seededHarness()
    const imported = crmCall(harness, 'importCrmPurchase', basePurchase({ crmOrderId: 'ORD-GROUP', crmEnrollmentId: 'ENR-GROUP' }))
    expect(imported.success).toBe(true)

    const acciones = [
      { action: 'verificarPagoCompraCrm', params: { crmOrderId: 'ORD-GROUP' } },
      { action: 'getCrmPurchaseStatus', params: { crmOrderId: 'ORD-GROUP' } },
      { action: 'getCrmPurchaseStatuses', params: { crmOrderIds: ['ORD-GROUP'] } },
      { action: 'getCrmEnrollmentCommerceState', params: { crmEnrollmentId: 'ENR-GROUP' } },
      { action: 'getCrmEnrollmentCommerceStates', params: { crmEnrollmentIds: ['ENR-GROUP'] } },
      { action: 'markCrmCourseCompleted', params: { crmEnrollmentId: 'ENR-GROUP' } },
    ]
    acciones.forEach(({ action, params }) => {
      const conSoloTokenLegacy = harness.context.processRequest(Object.assign({ action, token: 'integration-token' }, params))
      expect(conSoloTokenLegacy).toEqual({ success: false, error: 'Token de servicio CRM inválido o no configurado.' })

      const conServiceToken = crmCall(harness, action, params)
      expect(conServiceToken.success).toBe(true)
    })
  })
})

describe('21. importCrmEnrollment resuelve el Servicio por financeServiceId cuando llega, con fallback legacy por nombre', () => {
  function legacyImport(harness, overrides) {
    return harness.context.processRequest({
      action: 'addInscripcion',
      token: 'integration-token',
      idempotencyKey: overrides.crmEnrollmentId,
      inscripcion: Object.assign({
        crmContactId: 'CTC-1', crmCourseId: 'CRS-1', modality: 'Virtual',
        participant: { fullName: 'Ana Pérez', email: 'ana@example.com' }, amount: 20,
      }, overrides),
    })
  }

  it('financeServiceId resuelve por ID e ignora un courseTitle que no coincide con ningún Servicio por nombre', () => {
    const harness = seededHarness()
    harness.seed('Servicios', [
      { ID: 'SRV-2', Nombre: 'Curso Distinto', Modalidad: 'Virtual', Duracion: '40', Activo: true },
    ])
    const result = legacyImport(harness, {
      crmEnrollmentId: 'ENR-FSID-1', financeServiceId: 'SRV-2',
      courseTitle: 'Nombre que no coincide con ningún Servicio por nombre',
    })
    expect(result.success).toBe(true)
    const row = porId(harness, result.id)
    expect(row.ServicioID).toBe('SRV-2')
    expect(row.ServicioNombre).toBe('Curso Distinto')
  })

  it('financeServiceId que no resuelve a un Servicio Activo falla cerrado y NO cae al nombre (aunque el nombre sí calzaría)', () => {
    const harness = seededHarness()
    const result = legacyImport(harness, {
      crmEnrollmentId: 'ENR-FSID-2', financeServiceId: 'SRV-NO-EXISTE',
      courseTitle: 'Habilidades blandas para profesionales',
    })
    expect(result).toEqual({ success: false, error: 'Servicio de Finance no configurado para este curso.' })
    expect(inscripciones(harness)).toHaveLength(0)
  })

  it('financeServiceId apuntando a un Servicio inactivo también falla cerrado, sin caer al nombre', () => {
    const harness = seededHarness()
    harness.seed('Servicios', [
      { ID: 'SRV-INACTIVO', Nombre: 'Otro Curso Cualquiera', Modalidad: 'Virtual', Duracion: '60', Activo: false },
    ])
    const result = legacyImport(harness, {
      crmEnrollmentId: 'ENR-FSID-3', financeServiceId: 'SRV-INACTIVO',
      courseTitle: 'Habilidades blandas para profesionales',
    })
    expect(result).toEqual({ success: false, error: 'Servicio de Finance no configurado para este curso.' })
  })

  it('sin financeServiceId (ausente o vacío), el emparejamiento legacy por nombre sigue intacto', () => {
    const harness = seededHarness()
    const result = legacyImport(harness, {
      crmEnrollmentId: 'ENR-FSID-4', financeServiceId: '',
      courseTitle: 'Habilidades blandas para profesionales',
    })
    expect(result.success).toBe(true)
    expect(porId(harness, result.id).ServicioID).toBe('SRV-1')
  })
})
