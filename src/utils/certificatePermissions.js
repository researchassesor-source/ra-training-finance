export const CERTIFICATE_PERMISSION_MESSAGE = 'Solo un administrador puede emitir, descargar, regenerar o entregar certificados oficiales.'

export function canManageCertificates(user) {
  return user?.rol === 'admin'
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
