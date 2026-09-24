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
  harness.seed('Capacitadores', [{ ID: 'CAP-1', Nombre: 'Docente de Ejemplo', Identificacion: '0100000001', Resumen: 'Experiencia académica', Activo: true }])
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
  it('emite una sola vez en hoja independiente, verifica QR y archiva el PDF inmutable', () => {
    const harness = setup()
    const request = harness.context.processRequest
    const preflight = request({ action: 'preflightCertificadoCapacitador', token: 'admin-token', servicioId: 'SRV-1' })
    expect(preflight).toMatchObject({ success: true, data: { datosCompletos: true, emisionHabilitada: true } })
    const issued = request({ action: 'emitirCertificadoCapacitador', token: 'admin-token', servicioId: 'SRV-1' })
    expect(issued).toMatchObject({ success: true, data: { CertificateSubject: 'professional', ProfessionalRole: 'capacitador', TemplateVersion: 'ra-security-2026-v2' } })
    expect(request({ action: 'emitirCertificadoCapacitador', token: 'admin-token', servicioId: 'SRV-1' }).alreadyIssued).toBe(true)
    expect(harness.objects('CertificadosProfesionales')).toHaveLength(1)
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

  it('anula y reemite con código distinto sin borrar la versión histórica', () => {
    const harness = setup()
    const request = harness.context.processRequest
    const first = request({ action: 'emitirCertificadoCapacitador', token: 'admin-token', servicioId: 'SRV-1' }).data
    expect(request({ action: 'anularCertificadoCapacitador', token: 'admin-token', id: first.ID,
      motivo: 'Corrección de datos académicos', confirmacion: 'ANULAR' }).success).toBe(true)
    expect(request({ action: 'verificarCertificado', id: first.ID }).data.estado).toBe('anulado')
    expect(request({ action: 'emitirCertificadoCapacitador', token: 'admin-token', servicioId: 'SRV-1' }).success).toBe(false)
    const second = request({ action: 'reemitirCertificadoCapacitador', token: 'admin-token', id: first.ID,
      motivo: 'Corrección de datos académicos', confirmacion: 'REEMITIR' }).data
    expect(second.CertificateVersion).toBe(2)
    expect(second.CodigoCertificado).not.toBe(first.CodigoCertificado)
    expect(harness.objects('CertificadosProfesionales')).toHaveLength(2)
    expect(request({ action: 'verificarCertificado', id: first.ID }).data).toMatchObject({ estado: 'reemitido', certificadoVigenteId: second.ID })
    expect(request({ action: 'verificarCertificado', id: second.ID }).data.estado).toBe('vigente')
  })
})
