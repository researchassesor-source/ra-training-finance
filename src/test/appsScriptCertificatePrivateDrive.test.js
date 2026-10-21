import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createAppsScriptHarness } from './appsScriptHarness'

const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n')
const pdfHash = crypto.createHash('sha256').update(pdfBytes).digest('hex')

function setup() {
  const harness = createAppsScriptHarness()
  harness.seed('Sesiones', [
    { Token: 'admin-token', Username: 'admin.test', UserID: 'USR-A', Rol: 'admin', Nombre: 'Admin', Expira: '2099-01-01T00:00:00.000Z' },
    { Token: 'seller-token', Username: 'seller.test', UserID: 'USR-S', Rol: 'vendedor', Nombre: 'Seller', Expira: '2099-01-01T00:00:00.000Z' },
  ])
  harness.seed('Usuarios', [
    { ID: 'USR-A', Username: 'admin.test', Rol: 'admin', Activo: true },
    { ID: 'USR-S', Username: 'seller.test', Rol: 'vendedor', Activo: true },
  ])
  harness.seed('Servicios', [{ ID: 'SRV-1', Nombre: 'Curso', Duracion: '40', Activo: true }])
  harness.seed('Inscripciones', [
    { ID: 'INS-1', ClienteNombre: 'Persona Uno', ClienteID: '0100000001', ClienteEmail: 'persona@example.test', ServicioID: 'SRV-1', ServicioNombre: 'Curso', EstadoPago: 'verificado', EstadoCertificado: 'emitido', CodigoCertificado: 'RA-2026-1', CertificateVersion: 1, TemplateVersion: 'ra-canva-2026-v1' },
  ])
  harness.seed('Certificados', [
    { ID: 'CERT-1', InscripcionID: 'INS-1', CodigoCertificado: 'RA-2026-1', CertificateVersion: 1, TemplateVersion: 'ra-canva-2026-v1', CertificateStatus: 'emitido' },
  ])
  harness.seed('AuditoriaCertificados', [])
  return harness
}

function store(harness, overrides = {}) {
  return harness.context.processRequest({
    action: 'guardarPdfCertificadoPrivado', token: 'admin-token', id: 'CERT-1',
    certificateVersion: 1, templateVersion: 'ra-canva-2026-v1',
    pdfBase64: pdfBytes.toString('base64'), pdfHash, ...overrides,
  })
}

describe('archivo privado de certificados', () => {
  it('persiste en Drive una vez, verifica SHA-256 y permite recuperarlo con sesión admin', () => {
    const harness = setup()
    const first = store(harness)
    expect(first).toMatchObject({ success: true, hash: pdfHash, idempotent: false })
    expect(first.reference).toMatch(/^certificate-drive:drive-/)
    expect(harness.objects('Certificados')[0]).toMatchObject({ PdfHash: pdfHash, PdfStorageReference: first.reference })
    expect(harness.objects('Inscripciones')[0]).toMatchObject({ PdfHash: pdfHash, PdfStorageReference: first.reference })
    expect(harness.driveFiles.size).toBe(1)
    expect(harness.properties.get('CERTIFICATE_DRIVE_FOLDER_ID')).toMatch(/^folder-/)

    const again = store(harness)
    expect(again).toMatchObject({ success: true, reference: first.reference, idempotent: true })
    expect(harness.driveFiles.size).toBe(1)

    const read = harness.context.processRequest({ action: 'leerPdfCertificadoPrivado', token: 'admin-token', id: 'CERT-1' })
    expect(read).toMatchObject({ success: true, reference: first.reference, hash: pdfHash })
    expect(Buffer.from(read.contentBase64, 'base64')).toEqual(pdfBytes)
    expect(harness.objects('AuditoriaCertificados').map(row => row.Accion)).toContain('CERTIFICATE_ARTIFACT_REGISTERED')
  })

  it('archiva y recupera certificados normales por fragmentos, validando cada lectura y la huella completa', () => {
    const harness = setup()
    const request = harness.context.processRequest
    const bytes = Buffer.alloc(1572864 + 17, 0x62)
    Buffer.from('%PDF-').copy(bytes, 0)
    const hash = crypto.createHash('sha256').update(bytes).digest('hex')
    const uploadId = crypto.randomUUID()
    const chunks = [bytes.subarray(0, 1572864), bytes.subarray(1572864)]

    chunks.forEach((chunk, chunkIndex) => {
      expect(request({ action: 'guardarPdfPrivadoChunk', token: 'admin-token', kind: 'certificate', id: 'CERT-1',
        uploadId, chunkIndex, chunkCount: chunks.length, chunkBase64: chunk.toString('base64') })).toMatchObject({ success: true })
    })
    const archived = request({ action: 'finalizarPdfPrivadoChunk', token: 'admin-token', kind: 'certificate', id: 'CERT-1',
      uploadId, chunkCount: chunks.length, pdfHash: hash, templateVersion: 'ra-canva-2026-v1', certificateVersion: 1 })
    expect(archived).toMatchObject({ success: true, hash, idempotent: false })

    const first = request({ action: 'leerPdfPrivadoChunk', token: 'admin-token', kind: 'certificate',
      id: 'CERT-1', certificateId: 'CERT-1', chunkIndex: 0 })
    const last = request({ action: 'leerPdfPrivadoChunk', token: 'admin-token', kind: 'certificate',
      id: 'CERT-1', certificateId: 'CERT-1', chunkIndex: 1 })
    expect(first).toMatchObject({ success: true, totalBytes: bytes.length, totalChunks: 2, hash })
    expect(Buffer.from(first.contentBase64 + last.contentBase64, 'base64').equals(bytes)).toBe(true)

    const fileId = archived.reference.slice('certificate-drive:'.length)
    harness.driveFiles.get(fileId).blob.bytes[20] ^= 1
    const corrupt = request({ action: 'leerPdfPrivadoChunk', token: 'admin-token', kind: 'certificate',
      id: 'CERT-1', certificateId: 'CERT-1', chunkIndex: 0 })
    expect(corrupt.success).toBe(false)
    expect(corrupt.error).toMatch(/SHA-256/)
  })

  it('migra el PDF original al Drive privado sin cambiar código, versión, plantilla o estado', () => {
    const harness = setup()
    for (const name of ['Certificados', 'Inscripciones']) {
      const sheet = harness.sheets[name]
      const headers = sheet.rows[0]
      const row = sheet.rows[1]
      row[headers.indexOf('PdfHash')] = pdfHash
      row[headers.indexOf('PdfStorageReference')] = 'browser-indexeddb:CERT-1:v1'
    }
    const request = harness.context.processRequest
    const payload = {
      action: 'migrarPdfCertificadoPrivado', token: 'admin-token', id: 'INS-1', inscripcionId: 'INS-1',
      certificateId: 'CERT-1', pdfBase64: pdfBytes.toString('base64'), pdfHash,
      templateVersion: 'ra-canva-2026-v1', certificateVersion: 1,
      motivo: 'Centralizar la copia original firmada.', confirmacion: 'MIGRAR_PDF_ORIGINAL',
    }

    const first = request(payload)
    expect(first).toMatchObject({ success: true, hash: pdfHash, idempotent: false, migrated: true })
    expect(first.reference).toMatch(/^certificate-drive:drive-/)
    expect(harness.objects('Certificados')[0]).toMatchObject({
      PdfHash: pdfHash, PdfStorageReference: first.reference, CertificateVersion: 1,
      TemplateVersion: 'ra-canva-2026-v1', CertificateStatus: 'emitido', CodigoCertificado: 'RA-2026-1',
    })
    expect(harness.objects('Inscripciones')[0].PdfStorageReference).toBe(first.reference)
    expect(harness.driveFiles.size).toBe(1)
    expect(harness.objects('AuditoriaCertificados').map(row => row.Accion)).toContain('CERTIFICATE_ARTIFACT_MIGRATED_TO_DRIVE')

    const again = request(payload)
    expect(again).toMatchObject({ success: true, reference: first.reference, hash: pdfHash, idempotent: true })
    expect(harness.driveFiles.size).toBe(1)
    expect(harness.objects('AuditoriaCertificados').filter(row => row.Accion === 'CERTIFICATE_ARTIFACT_MIGRATED_TO_DRIVE')).toHaveLength(1)
  })

  it('rechaza archivo, huella, confirmación o rol incorrectos sin tocar la referencia oficial', () => {
    const harness = setup()
    const sheet = harness.sheets.Certificados
    const headers = sheet.rows[0]
    sheet.rows[1][headers.indexOf('PdfHash')] = pdfHash
    sheet.rows[1][headers.indexOf('PdfStorageReference')] = 'browser-indexeddb:CERT-1:v1'
    const payload = {
      action: 'migrarPdfCertificadoPrivado', token: 'admin-token', id: 'INS-1', inscripcionId: 'INS-1',
      certificateId: 'CERT-1', pdfBase64: pdfBytes.toString('base64'), pdfHash,
      templateVersion: 'ra-canva-2026-v1', certificateVersion: 1,
      motivo: 'Centralizar la copia original firmada.', confirmacion: 'MIGRAR_PDF_ORIGINAL',
    }
    const request = harness.context.processRequest

    expect(request({ ...payload, pdfHash: '0'.repeat(64) }).success).toBe(false)
    expect(request({ ...payload, confirmacion: '' }).success).toBe(false)
    expect(request({ ...payload, token: 'seller-token' }).success).toBe(false)
    expect(request({ ...payload, pdfBase64: Buffer.from('%PDF-different').toString('base64') }).success).toBe(false)
    expect(harness.objects('Certificados')[0].PdfStorageReference).toBe('browser-indexeddb:CERT-1:v1')
    expect(harness.driveFiles.size).toBe(0)
  })

  it('migra una versión histórica sin cambiar la referencia de la versión vigente de la inscripción', () => {
    const harness = setup()
    const certificateSheet = harness.sheets.Certificados
    const enrollmentSheet = harness.sheets.Inscripciones
    const set = (sheet, rowNumber, key, value) => { sheet.rows[rowNumber - 1][sheet.rows[0].indexOf(key)] = value }
    set(certificateSheet, 2, 'CertificateStatus', 'reemitido')
    set(certificateSheet, 2, 'PdfHash', pdfHash)
    set(certificateSheet, 2, 'PdfStorageReference', 'browser-indexeddb:CERT-1:v1')
    set(enrollmentSheet, 2, 'CertificateVersion', 2)
    set(enrollmentSheet, 2, 'CodigoCertificado', 'RA-2026-2')
    set(enrollmentSheet, 2, 'ReissuedCertificateId', 'CERT-2')
    set(enrollmentSheet, 2, 'PdfHash', 'b'.repeat(64))
    set(enrollmentSheet, 2, 'PdfStorageReference', 'certificate-drive:current')
    harness.seed('Certificados', [{ ID: 'CERT-2', InscripcionID: 'INS-1', CodigoCertificado: 'RA-2026-2',
      CertificateVersion: 2, TemplateVersion: 'ra-canva-2026-v2', CertificateStatus: 'emitido',
      PdfHash: 'b'.repeat(64), PdfStorageReference: 'certificate-drive:current' }])

    const migrated = harness.context.processRequest({
      action: 'migrarPdfCertificadoPrivado', token: 'admin-token', id: 'INS-1', inscripcionId: 'INS-1',
      certificateId: 'CERT-1', pdfBase64: pdfBytes.toString('base64'), pdfHash,
      templateVersion: 'ra-canva-2026-v1', certificateVersion: 1,
      motivo: 'Centralizar la copia original histórica.', confirmacion: 'MIGRAR_PDF_ORIGINAL',
    })

    expect(migrated.success).toBe(true)
    expect(harness.objects('Certificados').find(row => row.ID === 'CERT-1').PdfStorageReference).toBe(migrated.reference)
    expect(harness.objects('Certificados').find(row => row.ID === 'CERT-2').PdfStorageReference).toBe('certificate-drive:current')
    expect(harness.objects('Inscripciones')[0]).toMatchObject({
      CertificateVersion: 2, CodigoCertificado: 'RA-2026-2', PdfHash: 'b'.repeat(64),
      PdfStorageReference: 'certificate-drive:current', ReissuedCertificateId: 'CERT-2',
    })
  })

  it('revierte la referencia y elimina el archivo central si no se puede auditar la migración', () => {
    const harness = setup()
    for (const name of ['Certificados', 'Inscripciones']) {
      const sheet = harness.sheets[name]
      const headers = sheet.rows[0]
      sheet.rows[1][headers.indexOf('PdfHash')] = pdfHash
      sheet.rows[1][headers.indexOf('PdfStorageReference')] = 'browser-indexeddb:CERT-1:v1'
    }
    harness.sheets.AuditoriaCertificados.appendRow = () => { throw new Error('auditoría no disponible') }
    const result = harness.context.processRequest({
      action: 'migrarPdfCertificadoPrivado', token: 'admin-token', id: 'INS-1', inscripcionId: 'INS-1',
      certificateId: 'CERT-1', pdfBase64: pdfBytes.toString('base64'), pdfHash,
      templateVersion: 'ra-canva-2026-v1', certificateVersion: 1,
      motivo: 'Centralizar la copia original firmada.', confirmacion: 'MIGRAR_PDF_ORIGINAL',
    })

    expect(result.success).toBe(false)
    expect(harness.driveFiles.size).toBe(0)
    expect(harness.objects('Certificados')[0].PdfStorageReference).toBe('browser-indexeddb:CERT-1:v1')
    expect(harness.objects('Inscripciones')[0].PdfStorageReference).toBe('browser-indexeddb:CERT-1:v1')
  })

  it('niega lectura a usuarios no administrativos y bloquea sobrescrituras o hashes falsos', () => {
    const harness = setup()
    expect(store(harness, { pdfHash: '0'.repeat(64) }).success).toBe(false)
    expect(harness.driveFiles.size).toBe(0)
    const first = store(harness)
    expect(first.success).toBe(true)
    expect(store(harness, { pdfHash: '1'.repeat(64) }).success).toBe(false)
    expect(harness.driveFiles.size).toBe(1)
    expect(harness.context.processRequest({ action: 'leerPdfCertificadoPrivado', token: 'seller-token', id: 'CERT-1' }).success).toBe(false)
    expect(harness.context.processRequest({ action: 'leerPdfCertificadoPrivado', id: 'CERT-1' }).success).toBe(false)
  })

  it('no modifica certificados históricos que ya tienen un PDF oficial', () => {
    const harness = setup()
    for (const name of ['Certificados', 'Inscripciones']) {
      const headers = harness.sheets[name].rows[0]
      const row = harness.sheets[name].rows[1]
      row[headers.indexOf('PdfHash')] = 'a'.repeat(64)
      row[headers.indexOf('PdfStorageReference')] = 'browser-indexeddb:CERT-1:v1'
    }
    expect(store(harness).success).toBe(false)
    expect(harness.driveFiles.size).toBe(0)
    expect(harness.objects('Certificados')[0].PdfHash).toBe('a'.repeat(64))
  })

  it('revierte el registro y descarta el archivo si la auditoría falla', () => {
    const harness = setup()
    harness.sheets.AuditoriaCertificados.appendRow = () => { throw new Error('auditoría no disponible') }
    const result = store(harness)
    expect(result.success).toBe(false)
    expect(harness.driveFiles.size).toBe(0)
    expect(harness.objects('Certificados')[0].PdfHash).toBe('')
    expect(harness.objects('Certificados')[0].PdfStorageReference).toBe('')
    expect(harness.objects('Inscripciones')[0].PdfHash).toBe('')
  })

  it('reenvía exclusivamente el PDF privado vigente verificado, no un archivo del navegador', () => {
    const harness = setup()
    let sentMessage
    harness.context.MailApp = { sendEmail: message => { sentMessage = message } }
    const archived = store(harness)

    const sent = harness.context.processRequest({
      action: 'enviarCertificadoEmail', token: 'admin-token', id: 'INS-1', email: 'destino@example.test',
      pdfBase64: Buffer.from('%PDF-falso-del-cliente').toString('base64'),
    })

    expect(archived.success).toBe(true)
    expect(sent.success).toBe(true)
    expect(sentMessage.to).toBe('destino@example.test')
    expect(sentMessage.attachments).toHaveLength(1)
    expect(Buffer.from(sentMessage.attachments[0].getBytes())).toEqual(pdfBytes)
    expect(harness.objects('AuditoriaCertificados').map(row => row.Accion)).toContain('CERTIFICATE_SENT')
    expect(harness.objects('AuditoriaCertificados').find(row => row.Accion === 'CERTIFICATE_SENT').Metadatos)
      .toContain(pdfHash)

    const resent = harness.context.processRequest({ action: 'enviarCertificadoEmail', token: 'admin-token', id: 'INS-1' })
    expect(resent.success).toBe(true)
    expect(Buffer.from(sentMessage.attachments[0].getBytes())).toEqual(pdfBytes)
    expect(harness.objects('AuditoriaCertificados').map(row => row.Accion)).toContain('CERTIFICATE_RESENT')
  })

  it('rechaza el reenvío cuando falta el archivo original archivado o su hash no coincide', () => {
    const harness = setup()
    let attempts = 0
    harness.context.MailApp = { sendEmail: () => { attempts += 1 } }

    const missing = harness.context.processRequest({ action: 'enviarCertificadoEmail', token: 'admin-token', id: 'INS-1' })
    expect(missing.success).toBe(false)
    expect(missing.error).toContain('PDF original no está archivado')

    const archived = store(harness)
    expect(archived.success).toBe(true)
    const certificateSheet = harness.sheets.Certificados
    const certificateHeaders = certificateSheet.rows[0]
    certificateSheet.rows[1][certificateHeaders.indexOf('PdfHash')] = 'a'.repeat(64)
    const enrollmentSheet = harness.sheets.Inscripciones
    const enrollmentHeaders = enrollmentSheet.rows[0]
    enrollmentSheet.rows[1][enrollmentHeaders.indexOf('PdfHash')] = 'a'.repeat(64)
    const tampered = harness.context.processRequest({ action: 'enviarCertificadoEmail', token: 'admin-token', id: 'INS-1' })

    expect(tampered.success).toBe(false)
    expect(tampered.error).toContain('integridad')
    expect(attempts).toBe(0)
  })
})
