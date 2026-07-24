export const sriBillingEnabled = import.meta.env.VITE_ENABLE_SRI_BILLING === 'true'

export function canAccessFiscalModule({ enabled = sriBillingEnabled, isAdmin = false } = {}) {
  return Boolean(enabled && isAdmin)
}

export function getLocalFiscalDemoUser({ isDev = import.meta.env.DEV, enabled = sriBillingEnabled, demoAuth = import.meta.env.VITE_LOCAL_FISCAL_DEMO_AUTH === 'true', hostname = globalThis.location?.hostname || '' } = {}) {
  if (!isDev || !enabled || !demoAuth || !['localhost', '127.0.0.1', '::1'].includes(hostname)) return null
  return { username: 'admin-local-fiscal', nombre: 'Administración local ficticia', rol: 'admin', localFiscalDemo: true }
}

export const fiscalStatusLabel = {
  DRAFT: 'Borrador',
  VALIDATION_FAILED: 'Validación fallida',
  READY_TO_SIGN: 'Validado',
  SIGNED: 'Firma de demostración aplicada',
  PENDING_SUBMISSION: 'Pendiente de envío',
  SUBMITTED: 'Enviado al simulador',
  RECEIVED: 'Recibido (simulado)',
  PROCESSING: 'Procesando (simulado)',
  AUTHORIZED: 'Autorizado (simulado)',
  RETURNED: 'Devuelto (simulado)',
  NOT_AUTHORIZED: 'No autorizado (simulado)',
  RETRY_PENDING: 'Reintento pendiente',
  ERROR: 'Error local',
  CREDIT_NOTE_PENDING: 'Nota de crédito pendiente',
  CANCELLATION_REQUESTED: 'Cancelación interna solicitada',
  CANCELLED_INTERNAL: 'Cancelado internamente',
}

export function nextFiscalAction(document) {
  if (!document) return null
  if (['DRAFT', 'VALIDATION_FAILED'].includes(document.status)) return { key: 'validate', label: 'Validar borrador' }
  if (document.status === 'READY_TO_SIGN' && !document.xmlUnsignedPath) return { key: 'generate-xml', label: 'Generar y validar XML' }
  if (document.status === 'READY_TO_SIGN') return { key: 'sign', label: 'Aplicar firma de demostración' }
  if (['SIGNED', 'PENDING_SUBMISSION', 'RETRY_PENDING'].includes(document.status)) return { key: 'submit', label: 'Enviar al simulador' }
  if (['RECEIVED', 'PROCESSING'].includes(document.status)) return { key: 'check-authorization', label: 'Consultar autorización simulada' }
  return null
}
