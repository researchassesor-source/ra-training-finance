import { describe, expect, it } from 'vitest'
import { createAppsScriptHarness } from './appsScriptHarness'

function seededHarness() {
  const harness = createAppsScriptHarness()
  const future = '2099-01-01T00:00:00.000Z'
  harness.seed('Sesiones', [{ Token: 'admin-token', Username: 'admin.test', UserID: 'USR-A', Rol: 'admin', Nombre: 'Admin Test', Expira: future }])
  harness.seed('Usuarios', [{ ID: 'USR-A', Nombre: 'Admin Test', Username: 'admin.test', Rol: 'admin', Activo: true }])
  harness.seed('Servicios', [{ ID: 'SRV-1', Nombre: 'Curso Test', Duracion: '40', Activo: true }])
  harness.seed('AuditoriaCertificados', [])
  harness.seed('Certificados', [])
  harness.seed('Inscripciones', [
    {
      ID: 'INS-VOID', ClienteNombre: 'Persona Anulación', ClienteID: '0000000001', ServicioID: 'SRV-1', ServicioNombre: 'Curso Test',
      Modalidad: 'Virtual', FechaInicio: '2026-07-01', FechaFin: '2026-07-02', EstadoPago: 'verificado', EstadoCertificado: 'emitido',
      CodigoCertificado: 'RA-2026-VOID', FechaEmisionCertificado: '2026-07-03T10:00:00.000Z', EmitidoPor: 'admin.test', CreadoPor: 'admin.test',
    },
    {
      ID: 'INS-REISSUE', ClienteNombre: 'Persona Reemisión', ClienteID: '0000000002', ServicioID: 'SRV-1', ServicioNombre: 'Curso Test',
      Modalidad: 'Presencial', FechaInicio: '2026-07-04', FechaFin: '2026-07-05', EstadoPago: 'verificado', EstadoCertificado: 'emitido',
      CodigoCertificado: 'RA-2026-ORIGINAL', FechaEmisionCertificado: '2026-07-06T10:00:00.000Z', EmitidoPor: 'admin.test', CreadoPor: 'admin.test',
    },
  ])
  harness.seed('Ingresos', [])
  return harness
}

function historicalHashHarness() {
  const harness = createAppsScriptHarness()
  const future = '2099-01-01T00:00:00.000Z'
  harness.seed('Sesiones', [
    { Token: 'admin-token', Username: 'admin.test', UserID: 'USR-A', Rol: 'admin', Nombre: 'Admin Test', Expira: future },
    { Token: 'seller-token', Username: 'seller.test', UserID: 'USR-V', Rol: 'vendedor', Nombre: 'Seller Test', Expira: future },
    { Token: 'aval-token', Username: 'aval.test', UserID: 'USR-I', Rol: 'aval', Nombre: 'Aval Test', Expira: future },
  ])
  harness.seed('Usuarios', [
    { ID: 'USR-A', Nombre: 'Admin Test', Username: 'admin.test', Rol: 'admin', Activo: true },
    { ID: 'USR-V', Nombre: 'Seller Test', Username: 'seller.test', Rol: 'vendedor', Activo: true },
    { ID: 'USR-I', Nombre: 'Aval Test', Username: 'aval.test', Rol: 'aval', Activo: true },
  ])
  harness.seed('Servicios', [{ ID: 'SRV-1', Nombre: 'Curso Test', Duracion: '40', Activo: true }])
  harness.seed('AuditoriaCertificados', [])
  harness.seed('Certificados', [
    {
      ID: 'CERT-HIST', InscripcionID: 'INS-HIST', CodigoCertificado: 'RA-2024-HIST001',
      CertificateVersion: 1, TemplateVersion: 'ra-canva-2026-v1', PdfHash: 'a'.repeat(64),
      PdfStorageReference: 'browser-indexeddb:CERT-HIST:v1:historical-recovery', CertificateStatus: 'emitido',
      IssuedAt: '2024-01-13T10:00:00.000Z', IssuedBy: 'admin.test',
    },
    {
      ID: 'CERT-MODERN', InscripcionID: 'INS-MODERN', CodigoCertificado: 'RA-2026-MODERN001',
      CertificateVersion: 1, TemplateVersion: 'ra-canva-2026-v1', PdfHash: 'c'.repeat(64),
      PdfStorageReference: 'browser-indexeddb:CERT-MODERN:v1', CertificateStatus: 'emitido',
      IssuedAt: '2026-07-10T10:00:00.000Z', IssuedBy: 'admin.test',
    },
  ])
  harness.seed('Inscripciones', [
    {
      ID: 'INS-HIST', ClienteNombre: 'Persona Histórica', ClienteID: '0100000001', ServicioID: 'SRV-1',
      ServicioNombre: 'Curso Histórico', Modalidad: 'Virtual', FechaInicio: '2024-01-10', FechaFin: '2024-01-12',
      EstadoPago: 'verificado', EstadoCertificado: 'emitido', CodigoCertificado: 'RA-2024-HIST001',
      FechaEmisionCertificado: '2024-01-13T10:00:00.000Z', CertificateVersion: 1,
      TemplateVersion: 'legacy-inscription-v1', PdfHash: 'a'.repeat(64),
      PdfStorageReference: 'browser-indexeddb:CERT-HIST:v1:historical-recovery',
    },
    {
      ID: 'INS-MODERN', ClienteNombre: 'Persona Moderna', ClienteID: '0100000002', ServicioID: 'SRV-1',
      ServicioNombre: 'Curso Moderno', Modalidad: 'Presencial', FechaInicio: '2026-07-08', FechaFin: '2026-07-09',
      EstadoPago: 'verificado', EstadoCertificado: 'emitido', CodigoCertificado: 'RA-2026-MODERN001',
      FechaEmisionCertificado: '2026-07-10T10:00:00.000Z', CertificateVersion: 1,
      TemplateVersion: 'ra-canva-2026-v1', PdfHash: 'c'.repeat(64),
      PdfStorageReference: 'browser-indexeddb:CERT-MODERN:v1',
    },
  ])
  harness.seed('Ingresos', [])
  return harness
}

describe('ciclo de vida de certificados en Apps Script', () => {
  it('anula lógicamente, conserva el QR histórico y rechaza eliminación', () => {
    const harness = seededHarness()
    const { processRequest } = harness.context
    const missingReason = processRequest({ action: 'anularCertificado', token: 'admin-token', id: 'INS-VOID', motivo: '', confirmacion: 'ANULAR' })
    expect(missingReason.success).toBe(false)

    const voided = processRequest({ action: 'anularCertificado', token: 'admin-token', id: 'INS-VOID', motivo: 'Corrección institucional', confirmacion: 'ANULAR' })
    expect(voided.success).toBe(true)
    expect(voided.data.CertificateStatus).toBe('anulado')

    const publicResult = processRequest({ action: 'verificarCertificado', id: 'INS-VOID' })
    expect(publicResult).toMatchObject({ valido: true, data: { estado: 'anulado', nombre: 'Persona Anulación' } })

    const deletion = processRequest({ action: 'deleteInscripcion', token: 'admin-token', id: 'INS-VOID' })
    expect(deletion.success).toBe(false)
    expect(harness.objects('Inscripciones').some(item => item.ID === 'INS-VOID')).toBe(true)
    expect(harness.objects('AuditoriaCertificados').map(item => item.Accion)).toContain('CERTIFICATE_DELETE_REJECTED')
  })

  it('reemite con identificador nuevo y mantiene verificable el original', () => {
    const harness = seededHarness()
    const { processRequest } = harness.context
    const reissued = processRequest({ action: 'reemitirCertificado', token: 'admin-token', id: 'INS-REISSUE', motivo: 'Corrección del nombre', confirmacion: 'REEMITIR' })
    expect(reissued.success).toBe(true)
    expect(reissued.data.ID).not.toBe('INS-REISSUE')
    expect(reissued.data.CodigoCertificado).not.toBe('RA-2026-ORIGINAL')
    expect(reissued.data.CertificateVersion).toBe(2)

    const original = processRequest({ action: 'verificarCertificado', id: 'INS-REISSUE' })
    expect(original).toMatchObject({ valido: true, data: { estado: 'reemitido', certificadoVigenteId: reissued.data.ID } })
    const current = processRequest({ action: 'verificarCertificado', id: reissued.data.ID })
    expect(current).toMatchObject({ valido: true, data: { estado: 'vigente', version: 2 } })

    const records = harness.objects('Certificados')
    expect(records).toHaveLength(2)
    expect(records.find(item => item.ID === 'INS-REISSUE')).toMatchObject({ CertificateStatus: 'reemitido', ReissuedCertificateId: reissued.data.ID })
    expect(records.find(item => item.ID === reissued.data.ID)).toMatchObject({ OriginalCertificateId: 'INS-REISSUE', CertificateStatus: 'emitido' })
    expect(harness.locks).toEqual({ waits: 1, releases: 1 })
  })

  it('reserva códigos únicos bajo LockService y mantiene la emisión idempotente', () => {
    const harness = seededHarness()
    harness.seed('Inscripciones', [
      {
        ID: 'INS-A-1234567890', ClienteNombre: 'Persona Uno', ClienteID: '0000000003', ServicioID: 'SRV-1', ServicioNombre: 'Curso Test',
        Modalidad: 'Virtual', FechaInicio: '2026-08-01', FechaFin: '2026-08-02', EstadoPago: 'verificado', EstadoCertificado: 'pendiente', CreadoPor: 'admin.test',
      },
      {
        ID: 'INS-B-1234567890', ClienteNombre: 'Persona Dos', ClienteID: '0000000004', ServicioID: 'SRV-1', ServicioNombre: 'Curso Test',
        Modalidad: 'Virtual', FechaInicio: '2026-08-03', FechaFin: '2026-08-04', EstadoPago: 'verificado', EstadoCertificado: 'pendiente', CreadoPor: 'admin.test',
      },
    ])
    const { processRequest } = harness.context
    const first = processRequest({ action: 'emitirCertificado', token: 'admin-token', id: 'INS-A-1234567890' })
    const second = processRequest({ action: 'emitirCertificado', token: 'admin-token', id: 'INS-B-1234567890' })
    const retry = processRequest({ action: 'emitirCertificado', token: 'admin-token', id: 'INS-A-1234567890' })

    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    expect(first.data.CodigoCertificado).not.toBe(second.data.CodigoCertificado)
    expect(retry).toMatchObject({ success: true, alreadyIssued: true, data: { CodigoCertificado: first.data.CodigoCertificado } })
    expect(harness.objects('Certificados')).toHaveLength(2)
    expect(harness.locks).toEqual({ waits: 3, releases: 3 })
  })

  it('registra una sola huella y referencia privada por versión', () => {
    const harness = seededHarness()
    const { processRequest } = harness.context
    const emitted = processRequest({ action: 'emitirCertificado', token: 'admin-token', id: 'INS-VOID' })
    expect(emitted.success).toBe(true)
    const artifact = {
      id: 'INS-VOID',
      pdfHash: 'a'.repeat(64),
      pdfStorageReference: 'browser-indexeddb:INS-VOID:v1',
      templateVersion: 'ra-canva-2026-v1',
      certificateVersion: 1,
    }
    const registered = processRequest({ action: 'registrarArtefactoCertificado', token: 'admin-token', ...artifact })
    const confirmed = processRequest({ action: 'registrarArtefactoCertificado', token: 'admin-token', ...artifact })
    const overwrite = processRequest({ action: 'registrarArtefactoCertificado', token: 'admin-token', ...artifact, pdfHash: 'b'.repeat(64) })

    expect(registered.success).toBe(true)
    expect(confirmed.success).toBe(true)
    expect(overwrite.success).toBe(false)
    expect(harness.objects('Certificados')[0]).toMatchObject({ PdfHash: 'a'.repeat(64), PdfStorageReference: artifact.pdfStorageReference })
  })

  it('exige intención auditada antes de descargar y confirma el resultado después', () => {
    const harness = seededHarness()
    const { processRequest } = harness.context
    processRequest({ action: 'emitirCertificado', token: 'admin-token', id: 'INS-VOID' })
    const artifact = {
      id: 'INS-VOID', pdfHash: 'd'.repeat(64), pdfStorageReference: 'browser-indexeddb:INS-VOID:v1',
      templateVersion: 'ra-canva-2026-v1', certificateVersion: 1,
    }
    expect(processRequest({ action: 'registrarArtefactoCertificado', token: 'admin-token', ...artifact }).success).toBe(true)

    const requested = processRequest({
      action: 'solicitarDescargaCertificado', token: 'admin-token', id: 'INS-VOID',
      pdfHash: artifact.pdfHash, pdfStorageReference: artifact.pdfStorageReference,
    })
    expect(requested).toMatchObject({ success: true, auditStatus: 'AUDIT_PENDING' })
    expect(harness.objects('DescargasCertificados')[0].Estado).toBe('AUDIT_PENDING')

    const confirmed = processRequest({
      action: 'confirmarDescargaCertificado', token: 'admin-token', solicitudId: requested.requestId, resultado: 'completado',
    })
    expect(confirmed).toMatchObject({ success: true, auditStatus: 'AUDIT_CONFIRMED' })
    expect(harness.objects('DescargasCertificados')[0].Estado).toBe('AUDIT_CONFIRMED')
    expect(harness.objects('AuditoriaCertificados').map(item => item.Accion)).toEqual(expect.arrayContaining([
      'CERTIFICATE_DOWNLOAD_REQUESTED', 'CERTIFICATE_DOWNLOAD_COMPLETED',
    ]))
  })

  it('no autoriza una descarga invisible cuando falla la escritura de auditoría', () => {
    const harness = seededHarness()
    const { processRequest } = harness.context
    processRequest({ action: 'emitirCertificado', token: 'admin-token', id: 'INS-VOID' })
    const artifact = {
      id: 'INS-VOID', pdfHash: 'e'.repeat(64), pdfStorageReference: 'browser-indexeddb:INS-VOID:v1',
      templateVersion: 'ra-canva-2026-v1', certificateVersion: 1,
    }
    processRequest({ action: 'registrarArtefactoCertificado', token: 'admin-token', ...artifact })
    harness.sheets.AuditoriaCertificados.appendRow = () => { throw new Error('fixture audit failure') }

    const requested = processRequest({
      action: 'solicitarDescargaCertificado', token: 'admin-token', id: 'INS-VOID',
      pdfHash: artifact.pdfHash, pdfStorageReference: artifact.pdfStorageReference,
    })
    expect(requested.success).toBe(false)
    expect(requested.error).toContain('auditoría obligatoria')
    expect(harness.objects('DescargasCertificados')[0].Estado).toBe('AUDIT_PENDING')
  })

  it('audita el reporte de pago cuando se incorpora un comprobante', () => {
    const harness = seededHarness()
    const { processRequest } = harness.context
    const updated = processRequest({
      action: 'updateInscripcion', token: 'admin-token', id: 'INS-VOID',
      inscripcion: {
        clienteNombre: 'Persona Anulación', clienteID: '0000000001', clienteEmail: 'persona@example.test',
        clienteTelefono: '0999999999', servicioId: 'SRV-1', servicioNombre: 'Curso Test', modalidad: 'Virtual',
        fechaInicio: '2026-07-01', fechaFin: '2026-07-02', monto: 20, metodoPago: 'transferencia',
        numeroComprobante: 'COMP-TEST-001', fechaPago: '2026-07-01', requiereAvalExterno: false,
      },
    })
    expect(updated.success).toBe(true)
    expect(harness.objects('AuditoriaCertificados').map(item => item.Accion)).toContain('PAYMENT_REPORTED')
  })

  it('recupera una sola vez la huella legacy con trazabilidad y conserva todos los datos oficiales', () => {
    const harness = historicalHashHarness()
    const { processRequest } = harness.context
    const before = harness.objects('Inscripciones').find(item => item.ID === 'INS-HIST')
    const request = {
      action: 'registrarArtefactoCertificado', token: 'admin-token', id: 'INS-HIST',
      pdfHash: 'b'.repeat(64), pdfStorageReference: before.PdfStorageReference,
      templateVersion: 'ra-canva-2026-v1', certificateVersion: before.CertificateVersion,
      historicalHashRebase: true, previousPdfHash: before.PdfHash, originalArtifactUnavailable: true,
      historicalHashRebaseConfirmation: 'REBASE_HISTORICAL_HASH_ONCE',
      historicalHashRebaseReason: 'Recuperación controlada porque el artefacto PDF histórico original ya no está disponible.',
    }

    const recovered = processRequest(request)
    const after = harness.objects('Inscripciones').find(item => item.ID === 'INS-HIST')
    const artifactEvents = harness.objects('AuditoriaCertificados')
      .filter(item => item.Accion === 'CERTIFICATE_HISTORICAL_HASH_REBASED')

    expect(recovered).toMatchObject({ success: true, data: { historicalHashRebased: true, PdfHash: 'b'.repeat(64) } })
    expect(after).toMatchObject({
      ID: before.ID,
      ClienteNombre: before.ClienteNombre,
      ClienteID: before.ClienteID,
      ServicioNombre: before.ServicioNombre,
      Modalidad: before.Modalidad,
      FechaInicio: before.FechaInicio,
      FechaFin: before.FechaFin,
      EstadoCertificado: before.EstadoCertificado,
      CodigoCertificado: before.CodigoCertificado,
      CertificateVersion: before.CertificateVersion,
      TemplateVersion: before.TemplateVersion,
      PdfHash: 'b'.repeat(64),
    })
    expect(artifactEvents).toHaveLength(1)
    expect(JSON.parse(artifactEvents[0].Metadatos)).toMatchObject({
      previousPdfHash: 'a'.repeat(64),
      recoveredPdfHash: 'b'.repeat(64),
      pdfStorageReference: before.PdfStorageReference,
      administrator: 'admin.test',
      originalArtifactUnavailable: true,
    })

    const repeated = processRequest({ ...request, pdfHash: 'd'.repeat(64), previousPdfHash: 'b'.repeat(64) })
    expect(repeated.success).toBe(false)
    expect(repeated.error).toContain('ya fue recuperada una vez')
    expect(harness.objects('AuditoriaCertificados')
      .filter(item => item.Accion === 'CERTIFICATE_HISTORICAL_HASH_REBASED')).toHaveLength(1)
  })

  it('mantiene bloqueados el rebase moderno y los intentos de vendedor o aval', () => {
    const harness = historicalHashHarness()
    const { processRequest } = harness.context
    const base = {
      action: 'registrarArtefactoCertificado', id: 'INS-HIST', pdfHash: 'b'.repeat(64),
      pdfStorageReference: 'browser-indexeddb:CERT-HIST:v1:historical-recovery',
      templateVersion: 'ra-canva-2026-v1', certificateVersion: 1,
      historicalHashRebase: true, previousPdfHash: 'a'.repeat(64), originalArtifactUnavailable: true,
      historicalHashRebaseConfirmation: 'REBASE_HISTORICAL_HASH_ONCE',
      historicalHashRebaseReason: 'Recuperación controlada porque el artefacto PDF histórico original ya no está disponible.',
    }

    expect(processRequest({ ...base, token: 'seller-token' }).success).toBe(false)
    expect(processRequest({ ...base, token: 'aval-token' }).success).toBe(false)
    expect(harness.objects('Certificados').find(item => item.ID === 'CERT-HIST').PdfHash).toBe('a'.repeat(64))

    const modern = processRequest({
      ...base,
      token: 'admin-token',
      id: 'INS-MODERN',
      pdfHash: 'd'.repeat(64),
      previousPdfHash: 'c'.repeat(64),
      pdfStorageReference: 'browser-indexeddb:CERT-MODERN:v1',
    })
    expect(modern.success).toBe(false)
    expect(harness.objects('Certificados').find(item => item.ID === 'CERT-MODERN').PdfHash).toBe('c'.repeat(64))
    expect(harness.objects('AuditoriaCertificados')
      .filter(item => item.Accion === 'CERTIFICATE_HISTORICAL_HASH_REBASED')).toHaveLength(0)
  })
})
