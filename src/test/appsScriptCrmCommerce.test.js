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
  harness.seed('Servicios', [{ ID: 'SRV-1', Nombre: 'Habilidades blandas para profesionales', Modalidad: 'Virtual', Duracion: '60', Activo: true }])
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
}

function issueAndArchiveAval(harness, id) {
  activateCertificateSignatures(harness)
  const request = harness.context.processRequest
  const issued = request({ action: 'emitirEntregableAval', token: 'admin-token', id })
  expect(issued).toMatchObject({ success: true, data: { TemplateVersion: 'ra-itsal-security-2026-v1' } })
  const bytes = Buffer.from('%PDF-1.4 prueba sintética del archivo oficial')
  const hash = crypto.createHash('sha256').update(bytes).digest('hex')
  const archived = request({ action: 'guardarPdfEntregableAvalPrivado', token: 'admin-token', id,
    pdfBase64: bytes.toString('base64'), pdfHash: hash, templateVersion: 'ra-itsal-security-2026-v1' })
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
      inscripcion: { clienteNombre: 'Registro Manual', clienteID: '0102030405', servicioNombre: 'Habilidades blandas para profesionales', servicioId: 'SRV-1', modalidad: 'Virtual', fechaInicio: '2026-09-01', fechaFin: '2026-09-02', monto: 50, metodoPago: 'Efectivo', estadoPago: 'verificado' },
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
  function facturaFullLista(harness) {
    const full = crmCall(harness, 'importCrmPurchase', basePurchase())
    crmCall(harness, 'verificarPagoCompraCrm', { crmOrderId: 'ORD-1', numeroComprobante: 'C-1', fechaPago: '2026-09-01' })
    crmCall(harness, 'markCrmCourseCompleted', { crmEnrollmentId: 'ENR-1' })
    harness.context.processRequest({ action: 'emitirCertificado', token: 'admin-token', id: full.data.financeInscripcionId })
    return full.data.financeInscripcionId
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
    expect(issued.data).toMatchObject({ CertificateSubject: 'institutional_aval', AvalCodigoExterno: 'ITSAL-2026-123' })
    expect(request({ action: 'emitirEntregableAval', token: 'admin-token', id }).alreadyIssued).toBe(true)
    expect(request({ action: 'verificarCertificado', id: issued.data.ID }).valido).toBe(false)
    const bytes = Buffer.from('%PDF-1.4 prueba sintética del archivo oficial')
    const hash = crypto.createHash('sha256').update(bytes).digest('hex')
    expect(request({ action: 'guardarPdfEntregableAvalPrivado', token: 'aval-token', id,
      pdfBase64: bytes.toString('base64'), pdfHash: hash, templateVersion: issued.data.TemplateVersion }).success).toBe(false)
    expect(request({ action: 'guardarPdfEntregableAvalPrivado', token: 'admin-token', id,
      pdfBase64: bytes.toString('base64'), pdfHash: 'f'.repeat(64), templateVersion: issued.data.TemplateVersion }).success).toBe(false)
    expect(request({ action: 'guardarPdfEntregableAvalPrivado', token: 'admin-token', id,
      pdfBase64: bytes.toString('base64'), pdfHash: hash, templateVersion: issued.data.TemplateVersion }).success).toBe(true)
    const publicResult = request({ action: 'verificarCertificado', id: issued.data.ID })
    expect(publicResult).toMatchObject({ valido: true, data: { codigo: issued.data.CodigoCertificado, avalCodigoExterno: 'ITSAL-2026-123' } })
    expect(request({ action: 'leerPdfEntregableAvalPrivado', token: 'aval-token', id }).success).toBe(false)
  })

  it('ITSAL: la reemisión conserva el PDF anterior y cambia el QR vigente solo al archivar la nueva versión', () => {
    const harness = seededHarness()
    const id = facturaFullLista(harness)
    const request = harness.context.processRequest
    request({ action: 'marcarAval', token: 'aval-token', id, avalCodigoExterno: 'ITSAL-2026-123' })
    const { issued } = issueAndArchiveAval(harness, id)
    const oldId = issued.data.ID
    const next = request({ action: 'reemitirEntregableAval', token: 'admin-token', id,
      motivo: 'Corrección de presentación', confirmacion: 'REEMITIR' })
    expect(next).toMatchObject({ success: true, data: { CertificateVersion: 2 } })
    expect(next.data.ID).not.toBe(oldId)
    expect(request({ action: 'reemitirEntregableAval', token: 'admin-token', id,
      motivo: 'Corrección de presentación', confirmacion: 'REEMITIR' }).alreadyIssued).toBe(true)
    expect(request({ action: 'verificarCertificado', id: oldId }).data.estado).toBe('vigente')
    expect(request({ action: 'verificarCertificado', id: next.data.ID }).valido).toBe(false)
    const bytes = Buffer.from('%PDF-1.4 segunda versión sintética')
    const hash = crypto.createHash('sha256').update(bytes).digest('hex')
    expect(request({ action: 'guardarPdfEntregableAvalPrivado', token: 'admin-token', id,
      pdfBase64: bytes.toString('base64'), pdfHash: hash,
      templateVersion: 'ra-itsal-security-2026-v1' }).success).toBe(true)
    expect(request({ action: 'verificarCertificado', id: oldId }).data).toMatchObject({ estado: 'reemitido', certificadoVigenteId: next.data.ID })
    expect(request({ action: 'verificarCertificado', id: next.data.ID }).data).toMatchObject({ estado: 'vigente', version: 2 })
    expect(harness.objects('EntregablesAval')).toHaveLength(2)
    expect(harness.objects('Certificados')).toHaveLength(1)
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
