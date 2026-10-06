import crypto from 'node:crypto'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { createAppsScriptHarness } from './appsScriptHarness'

function signatureFixture() {
  const image = new PNG({ width: 180, height: 60 })
  crypto.randomBytes(image.data.length).copy(image.data)
  return PNG.sync.write(image).toString('base64')
}

function setup() {
  const harness = createAppsScriptHarness()
  harness.seed('Sesiones', [{ Token: 'admin-token', Username: 'admin.test', UserID: 'ADMIN', Rol: 'admin', Nombre: 'Admin', Expira: '2099-01-01T00:00:00.000Z' }])
  harness.seed('Usuarios', [{ ID: 'ADMIN', Username: 'admin.test', Rol: 'admin', Nombre: 'Admin', Activo: true }])
  harness.seed('Capacitadores', [{ ID: 'CAP-1', Nombre: 'Docente de Ejemplo', Identificacion: '0601234560', TipoIdentificacion: 'CEDULA_EC', Resumen: 'Experiencia académica', Activo: true }])
  harness.seed('Servicios', [{ ID: 'SRV-1', Nombre: 'Seminario de derecho', Duracion: '40', Modalidad: 'Virtual',
    FechaEvento: '2026-08-20', FechaFinEvento: '2026-08-22', EstadoEvento: 'finalizado',
    CapacitadorID: 'CAP-1', Capacitador: 'Docente de Ejemplo', Activo: true }])
  harness.seed('Inscripciones', [])
  harness.seed('Certificados', [])
  harness.seed('AuditoriaCertificados', [])
  const request = harness.context.processRequest
  const confirmation = 'CONFIRMO_FIRMA_AUTENTICA_Y_USO_AUTORIZADO'
  for (const rol of ['director', 'manager']) {
    expect(request({ action: 'registrarFirmaOficialCertificado', token: 'admin-token', rol,
      pngBase64: signatureFixture(), confirmacion: confirmation }).success).toBe(true)
  }
  expect(request({ action: 'activarPlantillaCertificadoV2', token: 'admin-token', confirmacion: 'ACTIVAR_CERTIFICADOS_SEGURIDAD_V2' }).success).toBe(true)
  return harness
}

describe('certificado profesional de capacitador', () => {
  it('usa las fechas académicas del curso y no las sesiones en vivo al emitir', () => {
    const harness = setup()
    const request = harness.context.processRequest
    expect(request({ action: 'updateServicio', token: 'admin-token', id: 'SRV-1', servicio: {
      fechaInicioCurso: '2026-08-01', fechaFinCurso: '2026-08-31',
    } }).success).toBe(true)
    const preflight = request({ action: 'preflightCertificadoCapacitador', token: 'admin-token', servicioId: 'SRV-1' })
    expect(preflight).toMatchObject({ success: true, data: {
      fechaInicio: '2026-08-01', fechaFin: '2026-08-31', datosCompletos: true,
    } })
    const issued = request({ action: 'emitirCertificadoCapacitador', token: 'admin-token', servicioId: 'SRV-1' })
    expect(issued).toMatchObject({ success: true, data: {
      FechaInicio: '2026-08-01', FechaFin: '2026-08-31',
    } })
    expect(harness.objects('CertificadosProfesionales')[0]).toMatchObject({
      FechaInicio: '2026-08-01', FechaFin: '2026-08-31',
    })
  })

  it('migra una hoja profesional antigua antes de reemitir y reutiliza la versión pendiente', () => {
    const harness = setup()
    const request = harness.context.processRequest
    const original = request({ action: 'emitirCertificadoCapacitador', token: 'admin-token', servicioId: 'SRV-1' }).data
    const legacy = harness.ensureSheet('CertificadosProfesionales')
    legacy.rows.forEach(row => { row.length = 26 })
    const params = { action: 'reemitirCertificadoCapacitador', token: 'admin-token', id: original.ID,
      motivo: 'Corrección de identificación', confirmacion: 'REEMITIR' }
    const prepared = request(params)
    expect(prepared).toMatchObject({ success: true, data: { CertificateStatus: 'pendiente_pdf',
      ReplacesCertificateId: original.ID } })
    expect(prepared.data.CertificatePreparedAt).toBeTruthy()
    expect(request(params)).toMatchObject({ success: true, alreadyPrepared: true,
      data: { ID: prepared.data.ID } })
    expect(harness.objects('CertificadosProfesionales')).toHaveLength(2)
    expect(harness.sourceHeaders('CertificadosProfesionales').every(header => legacy.rows[0].includes(header))).toBe(true)
  })

  it('guarda en texto una cédula iniciada en cero y la copia idéntica al nuevo certificado', () => {
    const harness = setup()
    const request = harness.context.processRequest
    const saved = request({ action: 'updateCapacitador', token: 'admin-token', id: 'CAP-1', capacitador: {
      nombre: 'Docente de Ejemplo', identificacion: '0600000012', tipoIdentificacion: 'CEDULA_EC',
      resumen: 'Experiencia académica',
    } })
    expect(saved.success).toBe(true)

    const profile = request({ action: 'getCapacitadores', token: 'admin-token' }).data.find(item => item.ID === 'CAP-1')
    expect(profile).toMatchObject({ Identificacion: '0600000012', TipoIdentificacion: 'CEDULA_EC' })
    const identityColumn = harness.sourceHeaders('Capacitadores').indexOf('Identificacion')
    expect(harness.sheets.Capacitadores.formats[1][identityColumn]).toBe('@')

    const preflight = request({ action: 'preflightCertificadoCapacitador', token: 'admin-token', servicioId: 'SRV-1' })
    expect(preflight).toMatchObject({ success: true, data: { identificacion: '0600000012', emisionHabilitada: true } })
    const issued = request({ action: 'emitirCertificadoCapacitador', token: 'admin-token', servicioId: 'SRV-1' })
    expect(issued.success).toBe(true)
    expect(harness.objects('CertificadosProfesionales')[0]).toMatchObject({ Identificacion: '0600000012', TipoIdentificacion: 'CEDULA_EC' })
  })

  it('emite una sola vez en hoja independiente, verifica QR y archiva el PDF inmutable', () => {
    const harness = setup()
    const request = harness.context.processRequest
    const preflight = request({ action: 'preflightCertificadoCapacitador', token: 'admin-token', servicioId: 'SRV-1' })
    expect(preflight).toMatchObject({ success: true, data: { datosCompletos: true, emisionHabilitada: true } })
    const issued = request({ action: 'emitirCertificadoCapacitador', token: 'admin-token', servicioId: 'SRV-1' })
    expect(issued).toMatchObject({ success: true, data: { CertificateSubject: 'professional', ProfessionalRole: 'capacitador', TemplateVersion: 'ra-security-2026-v2' } })
    expect(request({ action: 'emitirCertificadoCapacitador', token: 'admin-token', servicioId: 'SRV-1' }).alreadyIssued).toBe(true)
    expect(harness.objects('CertificadosProfesionales')).toHaveLength(1)
    expect(harness.objects('CertificadosProfesionales')[0]).toMatchObject({ Identificacion: '0601234560', TipoIdentificacion: 'CEDULA_EC' })
    expect(harness.objects('Certificados')).toHaveLength(0)
    expect(request({ action: 'verificarCertificado', id: issued.data.ID })).toMatchObject({
      success: true, valido: true, data: { estado: 'vigente', tipoSujeto: 'profesional', rolProfesional: 'capacitador' },
    })
    const pdf = Buffer.from('%PDF-1.4\nprofessional-fixture\n%%EOF')
    const hash = crypto.createHash('sha256').update(pdf).digest('hex')
    const params = { action: 'guardarPdfCertificadoPrivado', token: 'admin-token', id: issued.data.ID,
      pdfBase64: pdf.toString('base64'), pdfHash: hash, templateVersion: 'ra-security-2026-v2', certificateVersion: 1 }
    const stored = request(params)
    expect(stored).toMatchObject({ success: true, hash, idempotent: false })
    expect(request(params)).toMatchObject({ success: true, idempotent: true })
    expect(request({ ...params, pdfHash: 'a'.repeat(64) }).success).toBe(false)
    const recovered = request({ action: 'leerPdfCertificadoPrivado', token: 'admin-token', id: issued.data.ID })
    expect(recovered).toMatchObject({ success: true, hash })
    expect(Buffer.from(recovered.contentBase64, 'base64').equals(pdf)).toBe(true)
  })

  it('mantiene la versión anterior hasta archivar la reemisión profesional', () => {
    const harness = setup()
    const request = harness.context.processRequest
    const first = request({ action: 'emitirCertificadoCapacitador', token: 'admin-token', servicioId: 'SRV-1' }).data
    const oldPdf = Buffer.from('%PDF-1.4 trainer original\n%%EOF')
    const oldHash = crypto.createHash('sha256').update(oldPdf).digest('hex')
    expect(request({ action: 'guardarPdfCertificadoPrivado', token: 'admin-token', id: first.ID,
      pdfBase64: oldPdf.toString('base64'), pdfHash: oldHash,
      templateVersion: first.TemplateVersion, certificateVersion: first.CertificateVersion }).success).toBe(true)
    expect(request({ action: 'anularCertificadoCapacitador', token: 'admin-token', id: first.ID,
      motivo: 'Corrección de datos académicos', confirmacion: 'ANULAR' }).success).toBe(true)
    expect(request({ action: 'verificarCertificado', id: first.ID }).data.estado).toBe('anulado')
    expect(request({ action: 'emitirCertificadoCapacitador', token: 'admin-token', servicioId: 'SRV-1' }).success).toBe(false)
    const second = request({ action: 'reemitirCertificadoCapacitador', token: 'admin-token', id: first.ID,
      motivo: 'Corrección de datos académicos', confirmacion: 'REEMITIR' }).data
    expect(second.CertificateVersion).toBe(2)
    expect(second.CodigoCertificado).not.toBe(first.CodigoCertificado)
    expect(second.CertificateStatus).toBe('pendiente_pdf')
    expect(harness.objects('CertificadosProfesionales')).toHaveLength(2)
    expect(request({ action: 'verificarCertificado', id: first.ID }).data.estado).toBe('anulado')
    expect(request({ action: 'verificarCertificado', id: second.ID }).valido).toBe(false)
    const newPdf = Buffer.from('%PDF-1.4 trainer corrected\n%%EOF')
    const newHash = crypto.createHash('sha256').update(newPdf).digest('hex')
    const auditSheet = harness.ensureSheet('AuditoriaCertificados')
    const appendRow = auditSheet.appendRow.bind(auditSheet)
    auditSheet.appendRow = () => { throw new Error('audit unavailable') }
    const failedArchive = request({ action: 'guardarPdfCertificadoPrivado', token: 'admin-token', id: second.ID,
      pdfBase64: newPdf.toString('base64'), pdfHash: newHash,
      templateVersion: second.TemplateVersion, certificateVersion: second.CertificateVersion })
    expect(failedArchive.success).toBe(false)
    expect(harness.objects('CertificadosProfesionales').find(item => item.ID === first.ID)).toMatchObject({
      CertificateStatus: 'anulado', ReissuedCertificateId: '',
    })
    expect(harness.objects('CertificadosProfesionales').find(item => item.ID === second.ID)).toMatchObject({
      CertificateStatus: 'pendiente_pdf', PdfHash: '', PdfStorageReference: '',
    })
    expect([...harness.driveFiles.values()].some(file => file.getName().includes('_v2.pdf'))).toBe(false)
    expect([...harness.driveFiles.values()].some(file => file.getName().includes('_v1.pdf'))).toBe(true)
    auditSheet.appendRow = appendRow
    expect(request({ action: 'guardarPdfCertificadoPrivado', token: 'admin-token', id: second.ID,
      pdfBase64: newPdf.toString('base64'), pdfHash: newHash,
      templateVersion: second.TemplateVersion, certificateVersion: second.CertificateVersion }).success).toBe(true)
    expect(request({ action: 'verificarCertificado', id: first.ID }).data).toMatchObject({ estado: 'reemitido', certificadoVigenteId: second.ID })
    expect(request({ action: 'verificarCertificado', id: second.ID }).data.estado).toBe('vigente')
    expect(request({ action: 'getCertificadoCapacitadorParaDescarga', token: 'admin-token', id: first.ID }))
      .toMatchObject({ success: true, data: { ID: first.ID, CertificateVersion: 1 } })
  })
})
