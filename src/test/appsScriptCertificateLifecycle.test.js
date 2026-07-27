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
  })
})
