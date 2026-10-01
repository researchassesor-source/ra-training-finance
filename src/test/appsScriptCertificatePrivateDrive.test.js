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
