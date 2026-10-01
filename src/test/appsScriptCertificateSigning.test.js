import crypto from 'node:crypto'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { createAppsScriptHarness } from './appsScriptHarness'

function signatureFixture() {
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

function setup() {
  const harness = createAppsScriptHarness()
  const expiration = '2099-01-01T00:00:00.000Z'
  harness.seed('Sesiones', [
    { Token: 'admin-token', Username: 'admin.test', UserID: 'ADMIN', Rol: 'admin', Nombre: 'Admin', Expira: expiration },
    { Token: 'seller-token', Username: 'seller.test', UserID: 'SELLER', Rol: 'vendedor', Nombre: 'Seller', Expira: expiration },
  ])
  harness.seed('Usuarios', [
    { ID: 'ADMIN', Username: 'admin.test', Rol: 'admin', Nombre: 'Admin', Activo: true },
    { ID: 'SELLER', Username: 'seller.test', Rol: 'vendedor', Nombre: 'Seller', Activo: true },
  ])
  harness.seed('Servicios', [{ ID: 'SRV-1', Nombre: 'Seminario de derecho', Duracion: '40', TipoCertificado: 'asistencia', Activo: true }])
  harness.seed('Inscripciones', [{
    ID: 'INS-1', ClienteNombre: 'Persona Ejemplo', ClienteID: '0100000001', ServicioID: 'SRV-1',
    ServicioNombre: 'Seminario de derecho', FechaInicio: '2026-09-01', FechaFin: '2026-09-02',
    Modalidad: 'Virtual', EstadoPago: 'verificado', EstadoCertificado: 'pendiente', CreadoPor: 'admin.test',
  }])
  harness.seed('Certificados', [])
  harness.seed('AuditoriaCertificados', [])
  return harness
}

describe('firmas privadas y activación de la plantilla de seguridad', () => {
  it('guarda nombre/cargo reales del gerente solo para admin y revierte si no puede auditar', () => {
    const harness = setup()
    const request = harness.context.processRequest
    const valid = { nombre: 'Mgs. Alexandra Villagómez', cargo: 'Gerente General' }
    expect(request({ action: 'guardarDatosFirmanteCertificado', token: 'seller-token', ...valid,
      confirmacion: 'CONFIRMO_DATOS_OFICIALES_DE_FIRMA' }).success).toBe(false)
    expect(request({ action: 'guardarDatosFirmanteCertificado', token: 'admin-token', ...valid }).success).toBe(false)
    expect(request({ action: 'guardarDatosFirmanteCertificado', token: 'admin-token', nombre: 'A', cargo: 'B',
      confirmacion: 'CONFIRMO_DATOS_OFICIALES_DE_FIRMA' }).success).toBe(false)
    expect(request({ action: 'guardarDatosFirmanteCertificado', token: 'admin-token', ...valid,
      confirmacion: 'CONFIRMO_DATOS_OFICIALES_DE_FIRMA' })).toMatchObject({ success: true,
      data: { name: 'Mgs. Alexandra Villagómez', title: 'Gerente General' } })
    expect(request({ action: 'getEstadoFirmasCertificado', token: 'admin-token' }).data)
      .toMatchObject({ managerSignerConfigured: true, managerSigner: { name: valid.nombre, title: valid.cargo } })

    const rollback = setup()
    rollback.ensureSheet('AuditoriaCertificados').appendRow = () => { throw new Error('audit unavailable') }
    expect(rollback.context.processRequest({ action: 'guardarDatosFirmanteCertificado', token: 'admin-token', ...valid,
      confirmacion: 'CONFIRMO_DATOS_OFICIALES_DE_FIRMA' }).success).toBe(false)
    expect(rollback.context.processRequest({ action: 'getEstadoFirmasCertificado', token: 'admin-token' }).data.managerSignerConfigured).toBe(false)
  })

  it('no emite asistencia ni entrega rúbricas antes de activación; un vendedor no puede registrarlas', () => {
    const harness = setup()
    const request = harness.context.processRequest
    expect(request({ action: 'emitirCertificado', token: 'admin-token', id: 'INS-1' }).success).toBe(false)
    expect(request({ action: 'getFirmasOficialesCertificado', token: 'admin-token' }).success).toBe(false)
    expect(request({ action: 'registrarFirmaOficialCertificado', token: 'seller-token', rol: 'director',
      pngBase64: signatureFixture(), confirmacion: 'CONFIRMO_FIRMA_AUTENTICA_Y_USO_AUTORIZADO' }).success).toBe(false)
    expect(harness.driveFiles.size).toBe(0)
    expect(harness.objects('Inscripciones')[0].CodigoCertificado).toBe('')
  })

  it('requiere aprobación explícita y dos PNG privados; activa una vez sin tocar un histórico', () => {
    const harness = setup()
    const request = harness.context.processRequest
    const confirmation = 'CONFIRMO_FIRMA_AUTENTICA_Y_USO_AUTORIZADO'
    const pngBase64 = signatureFixture() // solo recurso sintético de prueba
    expect(request({ action: 'registrarFirmaOficialCertificado', token: 'admin-token', rol: 'director', pngBase64 }).success).toBe(false)
    expect(request({ action: 'registrarFirmaOficialCertificado', token: 'admin-token', rol: 'director', pngBase64: 'AAAA', confirmacion: confirmation }).success).toBe(false)
    expect(request({ action: 'registrarFirmaOficialCertificado', token: 'admin-token', rol: 'director', pngBase64, confirmacion: confirmation }).success).toBe(true)
    expect(request({ action: 'activarPlantillaCertificadoV2', token: 'admin-token', confirmacion: 'ACTIVAR_CERTIFICADOS_SEGURIDAD_V2' }).success).toBe(false)
    expect(request({ action: 'registrarFirmaOficialCertificado', token: 'admin-token', rol: 'manager', pngBase64: signatureFixture(), confirmacion: confirmation }).success).toBe(true)
    expect(request({ action: 'registrarFirmaOficialCertificado', token: 'admin-token', rol: 'director', pngBase64, confirmacion: confirmation }).success).toBe(false)
    expect(request({ action: 'activarPlantillaCertificadoV2', token: 'admin-token', confirmacion: 'ACTIVAR_CERTIFICADOS_SEGURIDAD_V2' }).success).toBe(true)
    expect(request({ action: 'activarPlantillaCertificadoV2', token: 'admin-token', confirmacion: 'ACTIVAR_CERTIFICADOS_SEGURIDAD_V2' }).alreadyActive).toBe(true)
    expect(request({ action: 'getEstadoFirmasCertificado', token: 'admin-token' }).data).toMatchObject({ director: true, manager: true, plantillaActiva: true })
    expect(request({ action: 'getFirmasOficialesCertificado', token: 'admin-token' }).signatures.director).toMatch(/^data:image\/png;base64,/)
    expect(request({ action: 'getFirmasOficialesCertificado', token: 'seller-token' }).success).toBe(false)
    const issued = request({ action: 'emitirCertificado', token: 'admin-token', id: 'INS-1' })
    expect(issued).toMatchObject({ success: true, data: { CertificateType: 'asistencia', TemplateVersion: 'ra-security-2026-v2' } })
    expect(request({ action: 'emitirCertificado', token: 'admin-token', id: 'INS-1' }).alreadyIssued).toBe(true)
    expect(harness.objects('AuditoriaCertificados').map(row => row.Accion)).toEqual(expect.arrayContaining([
      'CERTIFICATE_SIGNATURE_REGISTERED', 'CERTIFICATE_TEMPLATE_V2_ACTIVATED', 'CERTIFICATE_ISSUED',
    ]))
    expect(harness.logs.join(' ')).not.toContain(pngBase64)
  })

  it('versiona nuevas rúbricas sin sustituir v2 ni alterar sus descargas pendientes', () => {
    const harness = setup()
    const request = harness.context.processRequest
    const confirmacion = 'CONFIRMO_FIRMA_AUTENTICA_Y_USO_AUTORIZADO'
    const oldDirector = signatureFixture()
    const oldManager = signatureFixture()
    for (const [rol, pngBase64] of [['director', oldDirector], ['manager', oldManager]]) {
      expect(request({ action: 'registrarFirmaOficialCertificado', token: 'admin-token', rol, pngBase64, confirmacion }).success).toBe(true)
    }
    expect(request({ action: 'activarPlantillaCertificadoV2', token: 'admin-token',
      confirmacion: 'ACTIVAR_CERTIFICADOS_SEGURIDAD_V2' }).success).toBe(true)
    const original = request({ action: 'getFirmasOficialesCertificado', token: 'admin-token',
      templateVersion: 'ra-security-2026-v2' })
    expect(original.signatures.director).toContain(oldDirector)
    expect(original.signatures.manager).toContain(oldManager)

    expect(request({ action: 'activarPlantillaCertificadoV3', token: 'admin-token',
      confirmacion: 'ACTIVAR_CERTIFICADOS_SEGURIDAD_V3' }).success).toBe(false)
    const newDirector = signatureFixture()
    const newManager = signatureFixture()
    for (const [rol, pngBase64] of [['director', newDirector], ['manager', newManager]]) {
      expect(request({ action: 'registrarFirmaOficialCertificado', token: 'admin-token', rol,
        pngBase64, confirmacion, version: 'v3' }).success).toBe(true)
    }
    expect(request({ action: 'registrarFirmaOficialCertificado', token: 'admin-token', rol: 'director',
      pngBase64: signatureFixture(), confirmacion, version: 'v3' }).success).toBe(false)
    expect(request({ action: 'activarPlantillaCertificadoV3', token: 'seller-token',
      confirmacion: 'ACTIVAR_CERTIFICADOS_SEGURIDAD_V3' }).success).toBe(false)
    expect(request({ action: 'activarPlantillaCertificadoV3', token: 'admin-token',
      confirmacion: 'ACTIVAR_CERTIFICADOS_SEGURIDAD_V3' }).success).toBe(true)
    expect(request({ action: 'getEstadoFirmasCertificado', token: 'admin-token' }).data)
      .toMatchObject({ directorV3: true, managerV3: true, versionActiva: 'ra-security-2026-v3' })
    const historical = request({ action: 'getFirmasOficialesCertificado', token: 'admin-token',
      templateVersion: 'ra-security-2026-v2' })
    const current = request({ action: 'getFirmasOficialesCertificado', token: 'admin-token',
      templateVersion: 'ra-security-2026-v3' })
    expect(historical.signatures).toEqual(original.signatures)
    expect(current.signatures.director).toContain(newDirector)
    expect(current.signatures.manager).toContain(newManager)
    expect(current.signatures).not.toEqual(original.signatures)
    const institutional = request({ action: 'getFirmasOficialesCertificado', token: 'admin-token',
      templateVersion: 'ra-institutional-aval-2026',
      managerSignatureSha256: original.signers.manager.signatureSha256 })
    expect(institutional.signatures.manager).toBe(original.signatures.manager)
    expect(request({ action: 'getFirmasOficialesCertificado', token: 'admin-token',
      templateVersion: 'ra-institutional-aval-2026', managerSignatureSha256: '0'.repeat(64) }).success).toBe(false)
    const issued = request({ action: 'emitirCertificado', token: 'admin-token', id: 'INS-1' })
    expect(issued).toMatchObject({ success: true, data: { TemplateVersion: 'ra-security-2026-v3' } })
  })
})
