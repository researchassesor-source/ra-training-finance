import { describe, expect, it } from 'vitest'
import { normalizeIssuedCertificate } from './certificateGenerator'

describe('compatibilidad de metadatos de certificados históricos', () => {
  it('reconstruye código y fecha para un certificado ya emitido', () => {
    const normalized = normalizeIssuedCertificate({
      ID: 'INS-DEMO001',
      EstadoCertificado: 'emitido',
      FechaCreacion: '2026-07-21T11:14:00.000Z',
      CodigoCertificado: '',
      FechaEmisionCertificado: '',
    })

    expect(normalized.FechaEmisionCertificado).toBe('2026-07-21T11:14:00.000Z')
    expect(normalized.CodigoCertificado).toBe('RA-2026-INSDEMO001')
  })

  it('conserva los metadatos oficiales existentes', () => {
    const normalized = normalizeIssuedCertificate({
      ID: 'INS-002',
      EstadoCertificado: 'emitido',
      FechaEmisionCertificado: '2026-07-25T10:00:00.000Z',
      CodigoCertificado: 'RA-2026-OFICIAL002',
    })

    expect(normalized.FechaEmisionCertificado).toBe('2026-07-25T10:00:00.000Z')
    expect(normalized.CodigoCertificado).toBe('RA-2026-OFICIAL002')
  })

  it('no convierte una inscripción pendiente en emitida', () => {
    const normalized = normalizeIssuedCertificate({
      ID: 'INS-003',
      EstadoCertificado: 'pendiente',
      FechaCreacion: '2026-07-21T11:14:00.000Z',
    })

    expect(normalized.CodigoCertificado).toBeUndefined()
    expect(normalized.FechaEmisionCertificado).toBeUndefined()
    expect(normalized.EstadoCertificado).toBe('pendiente')
  })
})
