import { resolveFiscalRuntimeContext } from './fiscalRuntimeContext'

const OFFICIAL_PRODUCTION_HOSTS = new Set(['ra-training.com', 'www.ra-training.com'])

function configuredPublicHost(value) {
  try { return value ? new URL(value).hostname.toLowerCase() : '' } catch { return '' }
}

export function getFiscalFeatureState({ env = import.meta.env, hostname = globalThis.location?.hostname || '' } = {}) {
  const billingEnabled = env.VITE_ENABLE_SRI_BILLING === 'true'
  const previewRequested = env.VITE_FISCAL_PREVIEW_DEMO === 'true'
  const isolatedPreviewData = env.VITE_FISCAL_USE_EXISTING_APP_DATA === 'false'
  const configuredContext = env.VITE_FISCAL_RUNTIME_CONTEXT || 'auto'
  const runtimeContext = resolveFiscalRuntimeContext({ configured: configuredContext, hostname }).context
  const normalizedHost = String(hostname).toLowerCase()
  const publicHost = configuredPublicHost(env.VITE_PUBLIC_APP_URL)
  const officialProductionDomain = OFFICIAL_PRODUCTION_HOSTS.has(normalizedHost) || Boolean(publicHost && publicHost === normalizedHost)
  const previewEnvironmentAllowed = billingEnabled
    && previewRequested
    && isolatedPreviewData
    && configuredContext === 'preview'
    && runtimeContext === 'preview'
    && !officialProductionDomain

  return {
    billingEnabled,
    previewRequested,
    isolatedPreviewData,
    runtimeContext,
    officialProductionDomain,
    previewEnvironmentAllowed,
    moduleAvailable: billingEnabled && (!previewRequested || previewEnvironmentAllowed),
    previewBlocked: previewRequested && !previewEnvironmentAllowed,
  }
}

export const fiscalFeatureState = getFiscalFeatureState()
export const sriBillingEnabled = fiscalFeatureState.billingEnabled
export const fiscalModuleAvailable = fiscalFeatureState.moduleAvailable

export function normalSessionIsAdmin({ storage = globalThis.localStorage } = {}) {
  try { return JSON.parse(storage?.getItem('rat_user') || 'null')?.rol === 'admin' } catch { return false }
}

export function isFiscalPreviewDemoEnabled({ isAdmin = normalSessionIsAdmin(), ...options } = {}) {
  return Boolean(isAdmin && getFiscalFeatureState(options).previewEnvironmentAllowed)
}

export function canAccessFiscalModule({ enabled = fiscalModuleAvailable, isAdmin = false } = {}) {
  return Boolean(enabled && isAdmin)
}

export function getLocalFiscalDemoUser({ isDev = import.meta.env.DEV, enabled = sriBillingEnabled, demoAuth = import.meta.env.VITE_LOCAL_FISCAL_DEMO_AUTH === 'true', previewRequested = import.meta.env.VITE_FISCAL_PREVIEW_DEMO === 'true', hostname = globalThis.location?.hostname || '' } = {}) {
  if (!isDev || !enabled || !demoAuth || previewRequested || !['localhost', '127.0.0.1', '::1'].includes(hostname)) return null
  return { username: 'admin-local-fiscal', nombre: 'Administrador de prueba', rol: 'admin', localFiscalDemo: true }
}

export const fiscalStatusLabel = {
  DRAFT: 'Borrador de demostración',
  VALIDATION_FAILED: 'Validación fallida',
  READY_TO_SIGN: 'Validado (simulado)',
  SIGNED: 'Firma de demostración aplicada',
  PENDING_SUBMISSION: 'Pendiente de envío simulado',
  SUBMITTED: 'Enviado al simulador',
  RECEIVED: 'Recibido (simulado)',
  PROCESSING: 'Procesando (simulado)',
  AUTHORIZED: 'Autorizado (simulado)',
  RETURNED: 'Devuelto (simulado)',
  NOT_AUTHORIZED: 'No autorizado (simulado)',
  RETRY_PENDING: 'Reintento simulado pendiente',
  ERROR: 'Error de prueba',
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
