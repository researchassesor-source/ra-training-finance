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

export function certificateCapabilities(user, item = {}) {
  const admin = canManageCertificates(user)
  const issued = item.EstadoCertificado === 'emitido'
  const paymentVerified = item.EstadoPago === 'verificado'
  const requiresAval = item.RequiereAvalExterno === true || String(item.RequiereAvalExterno).toUpperCase() === 'TRUE'
  const avalReady = !requiresAval || item.EstadoAval === 'avalado'

  return {
    canIssue: admin && paymentVerified && avalReady && !issued,
    canDownload: admin && issued,
    canViewQr: admin && issued,
    canDeliver: admin && issued,
    canBatchDeliver: admin,
    canViewAudit: admin,
  }
}
