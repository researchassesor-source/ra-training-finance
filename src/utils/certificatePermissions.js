export const CERTIFICATE_PERMISSION_MESSAGE = 'Solo un administrador puede emitir, descargar, regenerar o entregar certificados oficiales.'

export function canManageCertificates(user) {
  return user?.rol === 'admin'
}

export const CERTIFICATE_DELETE_BLOCKED_MESSAGE = 'No puede eliminarse una inscripción con certificado emitido. Utilice anulación o corrección controlada.'

export function isCertificateProtectedAgainstDeletion(item = {}) {
  const status = String(item.CertificateStatus || item.EstadoCertificado || '').trim().toLowerCase()
  const protectedStatuses = new Set(['emitido', 'enviado', 'anulado', 'reemitido', 'issued', 'sent', 'voided', 'reissued'])
  const explicitlyIssued = item.CertificadoEmitido === true || String(item.CertificadoEmitido || '').toUpperCase() === 'TRUE'

  return explicitlyIssued
    || protectedStatuses.has(status)
    || Boolean(String(item.CodigoCertificado || '').trim())
    || Boolean(String(item.FechaCertificado || item.FechaEmisionCertificado || item.IssuedAt || '').trim())
}

export function certificateLifecycleStatus(item = {}) {
  const status = String(item.CertificateStatus || item.EstadoCertificado || '').trim().toLowerCase()
  const aliases = { issued: 'emitido', sent: 'enviado', voided: 'anulado', reissued: 'reemitido' }
  return aliases[status] || status || 'pendiente'
}

export function certificatePublicId(item = {}) {
  return String(item.CertificatePublicId || item.ReissuedCertificateId || item.ID || '').trim()
}

export function certificateCapabilities(user, item = {}) {
  const admin = canManageCertificates(user)
  const lifecycleStatus = certificateLifecycleStatus(item)
  const issued = ['emitido', 'enviado', 'reemitido'].includes(lifecycleStatus)
  const historical = issued || lifecycleStatus === 'anulado'
  const paymentVerified = item.EstadoPago === 'verificado'
  const requiresAval = item.RequiereAvalExterno === true || String(item.RequiereAvalExterno).toUpperCase() === 'TRUE'
  const avalReady = !requiresAval || item.EstadoAval === 'avalado'

  return {
    canIssue: admin && paymentVerified && avalReady && !issued,
    canDownload: admin && issued,
    canViewQr: admin && historical,
    canDeliver: admin && issued,
    canVoid: admin && issued,
    canReissue: admin && historical,
    canBatchDeliver: admin,
    canViewAudit: admin,
  }
}
