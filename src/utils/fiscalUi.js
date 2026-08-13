export const ACTIVE_FISCAL_STATUSES = new Set(['SUBMITTING', 'RECEIVED', 'PROCESSING'])

export function fiscalHumanStatus(status) {
  const value = String(status || '').trim().toUpperCase()
  if (value === 'DRAFT') return { label: 'Borrador', css: 'badge-gray', tone: 'neutral' }
  if (['SEQUENCE_RESERVED', 'GENERATED', 'SIGNED'].includes(value)) return { label: 'Preparando', css: 'badge-blue', tone: 'process' }
  if (['SUBMITTING', 'RECEIVED', 'PROCESSING'].includes(value)) return { label: 'Procesando en SRI', css: 'badge-yellow', tone: 'process' }
  if (['AUTHORIZED', 'DELIVERY_PENDING'].includes(value)) return { label: 'Autorizada · preparando documentos', css: 'badge-green', tone: 'success' }
  if (value === 'DELIVERED') return { label: 'Entregada', css: 'badge-green', tone: 'success' }
  if (value === 'NOT_AUTHORIZED') return { label: 'No autorizada', css: 'badge-red', tone: 'error' }
  if (value === 'RETURNED') return { label: 'Devuelta por SRI', css: 'badge-red', tone: 'error' }
  return { label: value || 'Sin estado', css: 'badge-gray', tone: 'neutral' }
}

export function fiscalSriStatus(factura) {
  const status = String(factura?.sriAuthorizationStatus || factura?.SriAuthorizationStatus || '').trim().toUpperCase()
  if (status === 'AUTORIZADO') return { label: 'Autorizado', css: 'badge-green' }
  if (status === 'NO_AUTORIZADO') return { label: 'No autorizado', css: 'badge-red' }
  const persisted = String(factura?.status || factura?.Status || '').trim().toUpperCase()
  if (['SUBMITTING', 'RECEIVED', 'PROCESSING'].includes(persisted)) return { label: 'En proceso', css: 'badge-yellow' }
  if (['AUTHORIZED', 'DELIVERY_PENDING', 'DELIVERED'].includes(persisted)) return { label: 'Autorizado', css: 'badge-green' }
  return { label: 'Pendiente', css: 'badge-gray' }
}

export function fiscalPaymentLabel(factura) {
  const internal = String(factura?.paymentMethodInternal || factura?.PaymentMethodInternal || '').trim()
  const code = String(factura?.sriPaymentCode || factura?.SriPaymentCode || '').trim()
  if (internal && code) return `${internal} · SRI ${code}`
  if (code) return `Código SRI ${code}`
  if (internal) return internal
  return 'No registrado en comprobante histórico'
}

export function fiscalEnvironmentLabel(environment) {
  return String(environment || '').toLowerCase() === 'production' ? 'Producción' : 'Pruebas'
}

export function documentNumberOf(factura) {
  return factura?.documentNumber || factura?.DocumentNumber
    || [factura?.establishment || factura?.Establishment, factura?.emissionPoint || factura?.EmissionPoint, factura?.sequential || factura?.Sequential].filter(Boolean).join('-')
    || 'Sin número'
}

export function centsToUsd(cents) {
  return new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD' }).format((Number(cents) || 0) / 100)
}
