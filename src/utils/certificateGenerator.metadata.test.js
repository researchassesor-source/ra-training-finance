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

  it('mantiene descargable una reemisión vigente y utiliza su identificador público', () => {
    const normalized = normalizeIssuedCertificate({
      ID: 'INS-004',
      ReissuedCertificateId: 'CRT-004-V2',
      EstadoCertificado: 'reemitido',
      FechaEmisionCertificado: '2026-07-27T10:00:00.000Z',
      CodigoCertificado: 'RA-2026-V2',
    })

    expect(normalized.EstadoCertificado).toBe('reemitido')
    expect(normalized.CodigoCertificado).toBe('RA-2026-V2')
  })

  it('no convierte un certificado anulado en descargable', () => {
    const normalized = normalizeIssuedCertificate({
      ID: 'INS-005',
      EstadoCertificado: 'anulado',
      CodigoCertificado: 'RA-2026-VOID',
    })
    expect(normalized.EstadoCertificado).toBe('anulado')
  })
})
