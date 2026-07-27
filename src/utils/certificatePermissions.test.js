import { describe, expect, it } from 'vitest'
import { canManageCertificates, certificateCapabilities } from './certificatePermissions'

const issued = {
  EstadoPago: 'verificado',
  EstadoCertificado: 'emitido',
  RequiereAvalExterno: false,
}

describe('permisos de certificados', () => {
  it('concede las acciones oficiales solamente al administrador', () => {
    expect(canManageCertificates({ rol: 'admin' })).toBe(true)
    expect(certificateCapabilities({ rol: 'admin' }, issued)).toMatchObject({
      canDownload: true,
      canViewQr: true,
      canDeliver: true,
      canBatchDeliver: true,
      canViewAudit: true,
    })
  })

  it.each(['vendedor', 'aval', 'usuario'])('rechaza todas las acciones administrativas para %s', rol => {
    expect(canManageCertificates({ rol })).toBe(false)
    expect(Object.values(certificateCapabilities({ rol }, issued)).every(value => value === false)).toBe(true)
  })

  it('no permite emitir sin pago verificado o con aval pendiente', () => {
    const admin = { rol: 'admin' }
    expect(certificateCapabilities(admin, { ...issued, EstadoCertificado: 'pendiente', EstadoPago: 'pendiente' }).canIssue).toBe(false)
    expect(certificateCapabilities(admin, {
      ...issued,
      EstadoCertificado: 'pendiente',
      RequiereAvalExterno: true,
      EstadoAval: 'pendiente',
    }).canIssue).toBe(false)
    expect(certificateCapabilities(admin, {
      ...issued,
      EstadoCertificado: 'pendiente',
      RequiereAvalExterno: true,
      EstadoAval: 'avalado',
    }).canIssue).toBe(true)
  })
})
