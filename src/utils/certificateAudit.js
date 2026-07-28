export const HISTORICAL_RECOVERY_AUDIT_ACTION = 'CERTIFICATE_HISTORICAL_ARTIFACT_RECOVERED'
export const HISTORICAL_HASH_REBASE_AUDIT_ACTION = 'CERTIFICATE_HISTORICAL_HASH_REBASED'

export function certificateAuditActionForDisplay(event = {}) {
  const action = String(event.Accion || '')
  const metadata = String(event.Metadatos || '')
  if (action === 'CERTIFICATE_ARTIFACT_REGISTERED' && metadata.includes(':historical-recovery')) {
    return HISTORICAL_RECOVERY_AUDIT_ACTION
  }
  return action
}
