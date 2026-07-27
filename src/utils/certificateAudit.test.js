import { describe, expect, it } from 'vitest'
import {
  certificateAuditActionForDisplay,
  HISTORICAL_RECOVERY_AUDIT_ACTION,
} from './certificateAudit'

describe('normalización visible de auditoría histórica', () => {
  it('identifica la recuperación por su referencia inmutable sin modificar Apps Script', () => {
    expect(certificateAuditActionForDisplay({
      Accion: 'CERTIFICATE_ARTIFACT_REGISTERED',
      Metadatos: JSON.stringify({
        pdfStorageReference: 'browser-indexeddb:INS-HIST:v1:historical-recovery',
      }),
    })).toBe(HISTORICAL_RECOVERY_AUDIT_ACTION)
  })

  it('no cambia las demás acciones de auditoría', () => {
    expect(certificateAuditActionForDisplay({ Accion: 'CERTIFICATE_DOWNLOAD_COMPLETED' }))
      .toBe('CERTIFICATE_DOWNLOAD_COMPLETED')
  })
})
