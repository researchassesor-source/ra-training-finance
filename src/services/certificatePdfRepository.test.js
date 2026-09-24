import crypto from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  store: vi.fn(),
  read: vi.fn(),
  signing: vi.fn(),
}))

vi.mock('./certificateArtifactStore', async importOriginal => ({
  ...await importOriginal(),
  CertificatePdfRepository: class {
    prepare = mocks.prepare
  },
}))
vi.mock('./api', () => ({ api: {
  guardarPdfCertificadoPrivado: mocks.store,
  leerPdfCertificadoPrivado: mocks.read,
  getFirmasOficialesCertificado: mocks.signing,
} }))

import { certificatePdfRepository } from './certificatePdfRepository'

const bytes = Buffer.from('%PDF-1.4\n%%EOF')
const hash = crypto.createHash('sha256').update(bytes).digest('hex')
const certificate = { ID: 'CERT-1', CertificatePublicId: 'CERT-1', CertificateVersion: 1, TemplateVersion: 'ra-canva-2026-v1' }

describe('repositorio de PDF oficiales', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: crypto.webcrypto })
  })

  it('archiva un PDF nuevo y devuelve la referencia central', async () => {
    mocks.prepare.mockResolvedValue({ blob: new Blob([bytes], { type: 'application/pdf' }), hash, reference: 'browser-indexeddb:CERT-1:v1', templateVersion: certificate.TemplateVersion, certificateVersion: 1 })
    mocks.store.mockResolvedValue({ success: true, reference: 'certificate-drive:drive-1', hash })
    const result = await certificatePdfRepository.prepare(certificate)
    expect(mocks.store).toHaveBeenCalledWith('CERT-1', expect.objectContaining({ pdfHash: hash, certificateVersion: 1 }))
    expect(result.reference).toBe('certificate-drive:drive-1')
    expect(result.hash).toBe(hash)
  })

  it('recupera y comprueba SHA-256 del original sin regenerarlo', async () => {
    mocks.read.mockResolvedValue({ reference: 'certificate-drive:drive-1', hash, contentBase64: bytes.toString('base64'), filename: 'certificado.pdf' })
    const result = await certificatePdfRepository.prepare({ ...certificate, PdfHash: hash, PdfStorageReference: 'certificate-drive:drive-1' })
    expect(result.filename).toBe('certificado.pdf')
    expect(result.reused).toBe(true)
    expect(mocks.prepare).not.toHaveBeenCalled()
  })

  it('rechaza contenido corrupto y no sustituye documentos históricos', async () => {
    mocks.read.mockResolvedValue({ reference: 'certificate-drive:drive-1', hash, contentBase64: Buffer.from('%PDF-corrupto').toString('base64') })
    await expect(certificatePdfRepository.prepare({ ...certificate, PdfHash: hash, PdfStorageReference: 'certificate-drive:drive-1' })).rejects.toThrow('SHA-256')
    mocks.prepare.mockResolvedValue({ blob: new Blob([bytes]), hash: 'a'.repeat(64), reference: 'browser-indexeddb:CERT-1:v1' })
    await certificatePdfRepository.prepare({ ...certificate, PdfHash: 'a'.repeat(64), PdfStorageReference: 'browser-indexeddb:CERT-1:v1' })
    expect(mocks.store).not.toHaveBeenCalled()
  })

  it('obtiene las firmas privadas solo al generar un PDF v2 nuevo y pasa las opciones al generador', async () => {
    mocks.signing.mockResolvedValue({ signatures: { director: 'data:image/png;base64,AA==', manager: 'data:image/png;base64,BB==' } })
    mocks.prepare.mockResolvedValue({ blob: new Blob([bytes], { type: 'application/pdf' }), hash,
      templateVersion: 'ra-security-2026-v2', certificateVersion: 1 })
    mocks.store.mockResolvedValue({ success: true, reference: 'certificate-drive:drive-v2', hash })
    await certificatePdfRepository.prepare({ ...certificate, TemplateVersion: 'ra-security-2026-v2' })
    expect(mocks.signing).toHaveBeenCalledTimes(1)
    expect(mocks.prepare).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      signatures: { director: 'data:image/png;base64,AA==', manager: 'data:image/png;base64,BB==' },
    }))
    mocks.read.mockResolvedValue({ reference: 'certificate-drive:drive-v2', hash, contentBase64: bytes.toString('base64') })
    await certificatePdfRepository.prepare({ ...certificate, TemplateVersion: 'ra-security-2026-v2',
      PdfHash: hash, PdfStorageReference: 'certificate-drive:drive-v2' })
    expect(mocks.signing).toHaveBeenCalledTimes(1)
  })
})
