import { beforeAll, describe, expect, it } from 'vitest'
import {
  artifactReferenceFor,
  BrowserIndexedDbCertificateArtifactStore,
  CERTIFICATE_ARTIFACT_ERROR_CODES,
  CertificatePdfRepository,
  MemoryCertificateArtifactStore,
  sha256Hex,
} from './certificateArtifactStore'

beforeAll(async () => {
  if (!globalThis.crypto?.subtle) {
    const { webcrypto } = await import('node:crypto')
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  }
})

describe('repositorio inmutable de PDFs de certificados', () => {
  it('genera un certificado nuevo, calcula SHA-256 y reutiliza exactamente el mismo blob', async () => {
    const store = new MemoryCertificateArtifactStore()
    const blob = new Blob(['certificado-fixture'], { type: 'application/pdf' })
    let generations = 0
    const repository = new CertificatePdfRepository({
      store,
      buildPdf: async () => {
        generations += 1
        return { blob, filename: 'certificado.pdf' }
      },
    })
    const certificate = { ID: 'CRT-1', CertificatePublicId: 'CRT-1', CertificateVersion: 1, TemplateVersion: 'test-v1' }
    const first = await repository.prepare(certificate)
    const second = await repository.prepare({ ...certificate, PdfHash: first.hash, PdfStorageReference: first.reference })

    expect(first.reference).toBe('browser-indexeddb:CRT-1:v1')
    expect(first.hash).toBe(await sha256Hex(blob))
    expect(second.reused).toBe(true)
    expect(await store.exists(first.reference)).toBe(true)
    expect(await store.verifyHash(blob, first.hash)).toBe(true)
    expect(generations).toBe(1)
  })

  it('acepta un artefacto existente cuando el hash local y el oficial son correctos', async () => {
    const blob = new Blob(['certificado-correcto'], { type: 'application/pdf' })
    const hash = await sha256Hex(blob)
    const store = new MemoryCertificateArtifactStore()
    await store.save({ reference: 'test-memory:HASH-OK:v1', hash, blob, filename: 'ok.pdf' })
    const repository = new CertificatePdfRepository({ store, buildPdf: async () => ({}) })

    await expect(repository.prepare({
      ID: 'HASH-OK',
      CertificateVersion: 1,
      PdfHash: hash,
      PdfStorageReference: 'test-memory:HASH-OK:v1',
    })).resolves.toMatchObject({ reused: true, hash })
  })

  it('bloquea un artefacto cuyo hash SHA-256 es incorrecto', async () => {
    const blob = new Blob(['certificado-adulterado'], { type: 'application/pdf' })
    const store = new MemoryCertificateArtifactStore()
    await store.save({
      reference: 'test-memory:HASH-BAD:v1',
      hash: await sha256Hex(blob),
      blob,
    })
    const repository = new CertificatePdfRepository({ store, buildPdf: async () => ({}) })

    await expect(repository.prepare({
      ID: 'HASH-BAD',
      CertificateVersion: 1,
      PdfHash: 'f'.repeat(64),
      PdfStorageReference: 'test-memory:HASH-BAD:v1',
    })).rejects.toMatchObject({ code: CERTIFICATE_ARTIFACT_ERROR_CODES.HASH_MISMATCH })
  })

  it('bloquea sustitución y regeneración cuando ya existe un hash oficial', async () => {
    const store = new MemoryCertificateArtifactStore()
    await store.save({ reference: 'test-memory:CRT-2:v1', hash: 'a'.repeat(64), blob: new Blob(['uno']) })
    await expect(store.save({ reference: 'test-memory:CRT-2:v1', hash: 'b'.repeat(64), blob: new Blob(['dos']) }))
      .rejects.toThrow('inmutable')

    const repository = new CertificatePdfRepository({ store: new MemoryCertificateArtifactStore(), buildPdf: async () => ({}) })
    await expect(repository.prepare({
      ID: 'CRT-3', CertificateVersion: 1, PdfHash: 'c'.repeat(64), PdfStorageReference: 'test-memory:CRT-3:v1',
    })).rejects.toMatchObject({ code: CERTIFICATE_ARTIFACT_ERROR_CODES.ARTIFACT_NOT_LOCAL })
  })

  it('detecta un IndexedDB vacío sin regenerar el certificado oficial', async () => {
    const repository = new CertificatePdfRepository({
      store: new MemoryCertificateArtifactStore(),
      buildPdf: async () => { throw new Error('no debe regenerarse') },
    })

    await expect(repository.prepare({
      ID: 'EMPTY-IDB',
      CertificateVersion: 1,
      PdfHash: 'a'.repeat(64),
      PdfStorageReference: 'test-memory:EMPTY-IDB:v1',
    })).rejects.toMatchObject({ code: CERTIFICATE_ARTIFACT_ERROR_CODES.ARTIFACT_NOT_LOCAL })
  })

  it('falla con un mensaje explícito cuando IndexedDB no responde', async () => {
    const hungIndexedDb = { open: () => ({}) }
    const store = new BrowserIndexedDbCertificateArtifactStore(hungIndexedDb, { timeoutMs: 5 })
    await expect(store.get('browser-indexeddb:HUNG:v1'))
      .rejects.toMatchObject({ code: CERTIFICATE_ARTIFACT_ERROR_CODES.STORAGE_TIMEOUT })
  })

  it('genera referencias separadas por versión', () => {
    expect(artifactReferenceFor({ CertificatePublicId: 'CRT-X', CertificateVersion: 2 })).toBe('browser-indexeddb:CRT-X:v2')
  })

  it('no regenera un histórico sin artefacto usando la plantilla actual', async () => {
    const repository = new CertificatePdfRepository({
      store: new MemoryCertificateArtifactStore(),
      buildPdf: async () => { throw new Error('no debe invocarse') },
    })
    await expect(repository.prepare({ ID: 'LEGACY-1', CertificateVersion: 1, TemplateVersion: 'legacy-v1' }))
      .rejects.toMatchObject({ code: CERTIFICATE_ARTIFACT_ERROR_CODES.LEGACY_ARTIFACT_MISSING })
  })
})
