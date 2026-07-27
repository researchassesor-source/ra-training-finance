import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { sha256Hex } from '../services/certificateArtifactStore'
import {
  buildCertificatePdf,
  deterministicCertificatePdfCreationDate,
  deterministicCertificatePdfFileId,
  normalizeIssuedCertificate,
} from './certificateGenerator'

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: crypto.webcrypto, configurable: true })
  }
})

function certificateAssetDataUrls() {
  const root = path.join(process.cwd(), 'src/assets/certificate/canva')
  const dataUrl = (filename, mimeType) => `data:${mimeType};base64,${fs.readFileSync(path.join(root, filename)).toString('base64')}`
  return {
    template: dataUrl('certificate-template.png', 'image/png'),
    plexRegular: dataUrl('IBMPlexSansCondensed-Regular.ttf', 'font/ttf'),
    plexBold: dataUrl('IBMPlexSansCondensed-Bold.ttf', 'font/ttf'),
    nameItalic: dataUrl('OpenSansCondensed-MediumItalic.ttf', 'font/ttf'),
  }
}

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

  it('fija metadatos PDF deterministas para reproducir la misma huella en otro equipo', () => {
    const identity = 'INS-HIST|RA-2024-HIST|1'
    expect(deterministicCertificatePdfFileId(identity)).toMatch(/^[A-F0-9]{32}$/)
    expect(deterministicCertificatePdfFileId(identity)).toBe(deterministicCertificatePdfFileId(identity))
    expect(deterministicCertificatePdfCreationDate('2024-01-13T10:20:30.000Z'))
      .toBe("D:20240113102030+00'00'")
  })

  it('genera exactamente la misma huella PDF con los mismos datos históricos', async () => {
    const certificate = {
      ID: 'INS-HASH-HIST', CertificatePublicId: 'INS-HASH-HIST', CertificateVersion: 1,
      ClienteNombre: 'Persona Histórica', ClienteID: '0100000001', ServicioNombre: 'Curso Histórico',
      Duracion: '40 horas', Modalidad: 'Virtual', FechaInicio: '2024-01-10', FechaFin: '2024-01-12',
      EstadoPago: 'verificado', EstadoCertificado: 'emitido', CertificateStatus: 'emitido',
      CodigoCertificado: 'RA-2024-HASH001', FechaEmisionCertificado: '2024-01-13T10:20:30.000Z',
      RequiereAvalExterno: false,
    }
    const assetDataUrls = certificateAssetDataUrls()
    const first = await buildCertificatePdf(certificate, { assetDataUrls })
    const second = await buildCertificatePdf(certificate, { assetDataUrls })

    expect(await sha256Hex(first.blob)).toBe(await sha256Hex(second.blob))
  }, 20_000)
})
