import { describe, expect, it } from 'vitest'
import { createAppsScriptHarness } from './appsScriptHarness'

const PDF_HASH = 'a'.repeat(64)
const PDF_REFERENCE = 'certificate-drive:documento-prueba'

function setup() {
  const app = createAppsScriptHarness()
  app.seed('Sesiones', [
    { Token: 'admin-token', Username: 'admin', UserID: 'USR-A', Rol: 'admin', Expira: '2099-01-01T00:00:00.000Z' },
    { Token: 'aval-token', Username: 'aval', UserID: 'USR-I', Rol: 'aval', Expira: '2099-01-01T00:00:00.000Z' },
  ])
  app.seed('Usuarios', [
    { ID: 'USR-A', Username: 'admin', Rol: 'admin', Activo: true },
    { ID: 'USR-I', Username: 'aval', Rol: 'aval', Activo: true },
  ])
  app.seed('Certificados', [
    { ID: 'N1', InscripcionID: 'INS-1', CertificateVersion: 1, CertificateStatus: 'reemitido',
      IssuedAt: '2026-09-01T10:00:00.000Z', PdfHash: PDF_HASH, PdfStorageReference: PDF_REFERENCE },
    { ID: 'N2', InscripcionID: 'INS-1', CertificateVersion: 2, ReplacesCertificateId: 'N1', CertificateStatus: 'emitido',
      IssuedAt: '2026-09-02T10:00:00.000Z', PdfHash: PDF_HASH, PdfStorageReference: PDF_REFERENCE },
    { ID: 'N3', InscripcionID: 'INS-2', CertificateVersion: 1, CertificateStatus: 'pendiente_pdf',
      IssuedAt: '2026-09-03T10:00:00.000Z' },
    { ID: 'N4', InscripcionID: 'INS-3', CertificateVersion: 1, CertificateStatus: 'emitido',
      IssuedAt: '2026-08-30T10:00:00.000Z', PdfHash: PDF_HASH, PdfStorageReference: PDF_REFERENCE },
  ])
  app.seed('EntregablesAval', [
    { ID: 'A1', InscripcionID: 'INS-1', CertificateVersion: 1, CertificateStatus: 'anulado',
      IssuedAt: '2026-09-04T10:00:00.000Z', PdfHash: PDF_HASH, PdfStorageReference: PDF_REFERENCE },
    { ID: 'A2', InscripcionID: 'INS-1', CertificateVersion: 2, ReplacesCertificateId: 'A1', CertificateStatus: 'pendiente_pdf',
      IssuedAt: '2026-09-05T10:00:00.000Z' },
    { ID: 'A3', InscripcionID: 'INS-2', CertificateVersion: 1, CertificateStatus: 'emitido',
      IssuedAt: '2026-09-06T10:00:00.000Z', PdfHash: PDF_HASH, PdfStorageReference: PDF_REFERENCE },
  ])
  return app
}

describe('resumen de certificaciones para administración', () => {
  it('cuenta personas una vez y documentos/versiones oficiales sin incluir borradores', () => {
    const app = setup()
    const result = app.context.processRequest({ action: 'getResumenCertificaciones', token: 'admin-token',
      desde: '2026-09-01', hasta: '2026-09-30' })
    expect(result).toMatchObject({ success: true, data: {
      personasCertificadas: 2, documentosNormales: 2, documentosAvalados: 2,
      documentosTotales: 4, reemisionesNormales: 1, reemisionesAvaladas: 0,
      reemisionesTotales: 1, documentosAnulados: 1,
    } })
  })

  it('rechaza roles no administrativos y rangos invertidos', () => {
    const app = setup()
    expect(app.context.processRequest({ action: 'getResumenCertificaciones', token: 'aval-token' }).success).toBe(false)
    expect(app.context.processRequest({ action: 'getResumenCertificaciones', token: 'admin-token',
      desde: '2026-10-01', hasta: '2026-09-01' }).success).toBe(false)
  })
})
