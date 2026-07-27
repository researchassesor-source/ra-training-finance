const DB_NAME = 'ra-training-certificate-artifacts'
const STORE_NAME = 'pdf-artifacts'
const DB_VERSION = 1

export const CERTIFICATE_ARTIFACT_ERROR_CODES = Object.freeze({
  INVALID_BINARY: 'CERTIFICATE_INVALID_BINARY',
  HASH_UNAVAILABLE: 'CERTIFICATE_HASH_UNAVAILABLE',
  HASH_MISMATCH: 'CERTIFICATE_HASH_MISMATCH',
  STORAGE_UNAVAILABLE: 'CERTIFICATE_STORAGE_UNAVAILABLE',
  STORAGE_BLOCKED: 'CERTIFICATE_STORAGE_BLOCKED',
  STORAGE_TIMEOUT: 'CERTIFICATE_STORAGE_TIMEOUT',
  STORAGE_READ_FAILED: 'CERTIFICATE_STORAGE_READ_FAILED',
  STORAGE_WRITE_FAILED: 'CERTIFICATE_STORAGE_WRITE_FAILED',
  STORAGE_REFERENCE_UNSUPPORTED: 'CERTIFICATE_STORAGE_REFERENCE_UNSUPPORTED',
  ARTIFACT_NOT_LOCAL: 'CERTIFICATE_ARTIFACT_NOT_LOCAL',
  LEGACY_ARTIFACT_MISSING: 'CERTIFICATE_LEGACY_ARTIFACT_MISSING',
  ARTIFACT_IMMUTABLE: 'CERTIFICATE_ARTIFACT_IMMUTABLE',
  GENERATION_TIMEOUT: 'CERTIFICATE_GENERATION_TIMEOUT',
})

export class CertificateArtifactError extends Error {
  constructor(code, message, options = {}) {
    super(message, options)
    this.name = 'CertificateArtifactError'
    this.code = code
  }
}

export function isControlledCertificateRecoveryAvailable(error) {
  return [
    CERTIFICATE_ARTIFACT_ERROR_CODES.ARTIFACT_NOT_LOCAL,
    CERTIFICATE_ARTIFACT_ERROR_CODES.LEGACY_ARTIFACT_MISSING,
  ].includes(error?.code)
}

export async function withCertificateTimeout(promise, timeoutMs, code, message) {
  let timeoutId
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timeoutId = globalThis.setTimeout(() => {
          reject(new CertificateArtifactError(code, message))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) globalThis.clearTimeout(timeoutId)
  }
}

function asArrayBuffer(value) {
  if (value instanceof Blob) {
    if (typeof value.arrayBuffer === 'function') return value.arrayBuffer()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new CertificateArtifactError(
        CERTIFICATE_ARTIFACT_ERROR_CODES.INVALID_BINARY,
        'No se pudo leer el artefacto PDF para verificarlo.',
      ))
      reader.readAsArrayBuffer(value)
    })
  }
  if (value instanceof ArrayBuffer) return Promise.resolve(value)
  if (ArrayBuffer.isView(value)) {
    return Promise.resolve(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength))
  }
  throw new CertificateArtifactError(
    CERTIFICATE_ARTIFACT_ERROR_CODES.INVALID_BINARY,
    'El artefacto del certificado no contiene datos binarios válidos.',
  )
}

export async function sha256Hex(value) {
  const data = await asArrayBuffer(value)
  if (!globalThis.crypto?.subtle) {
    throw new CertificateArtifactError(
      CERTIFICATE_ARTIFACT_ERROR_CODES.HASH_UNAVAILABLE,
      'Este navegador no permite verificar la integridad SHA-256 del certificado.',
    )
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export function artifactReferenceFor(certificate) {
  const publicId = String(certificate.CertificatePublicId || certificate.ReissuedCertificateId || certificate.ID || '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
  const version = Number(certificate.CertificateVersion) || 1
  if (!publicId) {
    throw new CertificateArtifactError(
      CERTIFICATE_ARTIFACT_ERROR_CODES.STORAGE_REFERENCE_UNSUPPORTED,
      'El certificado no tiene un identificador público para almacenar su PDF.',
    )
  }
  return `browser-indexeddb:${publicId}:v${version}`
}

export class CertificateArtifactStore {
  async get() {
    throw new Error('CertificateArtifactStore.get() debe ser implementado por el proveedor.')
  }

  async save() {
    throw new Error('CertificateArtifactStore.save() debe ser implementado por el proveedor.')
  }

  async exists(reference) {
    return Boolean(await this.get(reference))
  }

  async calculateHash(blob) {
    return sha256Hex(blob)
  }

  async verifyHash(blob, expectedHash) {
    return (await this.calculateHash(blob)) === String(expectedHash || '').trim().toLowerCase()
  }
}

export class MemoryCertificateArtifactStore extends CertificateArtifactStore {
  constructor() {
    super()
    this.records = new Map()
  }

  async get(reference) {
    return this.records.get(reference) || null
  }

  async save(record) {
    const current = this.records.get(record.reference)
    if (current && current.hash !== record.hash) {
      throw new CertificateArtifactError(
        CERTIFICATE_ARTIFACT_ERROR_CODES.ARTIFACT_IMMUTABLE,
        'El artefacto PDF es inmutable y no puede sobrescribirse.',
      )
    }
    this.records.set(record.reference, record)
    return record
  }
}

export class BrowserIndexedDbCertificateArtifactStore extends CertificateArtifactStore {
  constructor(indexedDb = globalThis.indexedDB, { timeoutMs = 8_000 } = {}) {
    super()
    this.indexedDb = indexedDb
    this.timeoutMs = timeoutMs
    this.dbPromise = null
  }

  open() {
    if (!this.indexedDb) {
      return Promise.reject(new CertificateArtifactError(
        CERTIFICATE_ARTIFACT_ERROR_CODES.STORAGE_UNAVAILABLE,
        'El navegador no dispone del almacenamiento privado requerido para certificados.',
      ))
    }
    if (this.dbPromise) return this.dbPromise
    const opening = new Promise((resolve, reject) => {
      const request = this.indexedDb.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'reference' })
      }
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close()
        resolve(request.result)
      }
      request.onblocked = () => reject(new CertificateArtifactError(
        CERTIFICATE_ARTIFACT_ERROR_CODES.STORAGE_BLOCKED,
        'El almacenamiento privado de certificados está bloqueado por otra pestaña. Cierre las demás pestañas e inténtelo nuevamente.',
      ))
      request.onerror = () => reject(new CertificateArtifactError(
        CERTIFICATE_ARTIFACT_ERROR_CODES.STORAGE_UNAVAILABLE,
        'No se pudo abrir el almacenamiento privado de certificados.',
      ))
    })
    this.dbPromise = withCertificateTimeout(
      opening,
      this.timeoutMs,
      CERTIFICATE_ARTIFACT_ERROR_CODES.STORAGE_TIMEOUT,
      'El almacenamiento privado de certificados no respondió a tiempo.',
    ).catch(error => {
      this.dbPromise = null
      throw error
    })
    return this.dbPromise
  }

  async get(reference) {
    const db = await this.open()
    const reading = new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const request = transaction.objectStore(STORE_NAME).get(reference)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(new CertificateArtifactError(
        CERTIFICATE_ARTIFACT_ERROR_CODES.STORAGE_READ_FAILED,
        'No se pudo leer el artefacto privado del certificado.',
      ))
      transaction.onabort = () => reject(new CertificateArtifactError(
        CERTIFICATE_ARTIFACT_ERROR_CODES.STORAGE_READ_FAILED,
        'La lectura del artefacto privado fue interrumpida.',
      ))
    })
    return withCertificateTimeout(
      reading,
      this.timeoutMs,
      CERTIFICATE_ARTIFACT_ERROR_CODES.STORAGE_TIMEOUT,
      'La lectura del certificado no respondió a tiempo.',
    )
  }

  async save(record) {
    const current = await this.get(record.reference)
    if (current && current.hash !== record.hash) {
      throw new CertificateArtifactError(
        CERTIFICATE_ARTIFACT_ERROR_CODES.ARTIFACT_IMMUTABLE,
        'El artefacto PDF es inmutable y no puede sobrescribirse.',
      )
    }
    const db = await this.open()
    const writing = new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const request = transaction.objectStore(STORE_NAME).put(record)
      request.onsuccess = () => resolve(record)
      request.onerror = () => reject(new CertificateArtifactError(
        CERTIFICATE_ARTIFACT_ERROR_CODES.STORAGE_WRITE_FAILED,
        'No se pudo guardar el artefacto privado del certificado.',
      ))
      transaction.onabort = () => reject(new CertificateArtifactError(
        CERTIFICATE_ARTIFACT_ERROR_CODES.STORAGE_WRITE_FAILED,
        'El almacenamiento privado interrumpió el guardado del certificado.',
      ))
    })
    return withCertificateTimeout(
      writing,
      this.timeoutMs,
      CERTIFICATE_ARTIFACT_ERROR_CODES.STORAGE_TIMEOUT,
      'El guardado del certificado no respondió a tiempo.',
    )
  }
}

export class CertificatePdfRepository {
  constructor({ store, buildPdf, timeoutMs = 30_000 }) {
    this.store = store
    this.buildPdf = buildPdf
    this.timeoutMs = timeoutMs
  }

  async prepare(certificate) {
    const reference = String(certificate.PdfStorageReference || artifactReferenceFor(certificate))
    if (!reference.startsWith('browser-indexeddb:') && !reference.startsWith('test-memory:')) {
      throw new CertificateArtifactError(
        CERTIFICATE_ARTIFACT_ERROR_CODES.STORAGE_REFERENCE_UNSUPPORTED,
        'El PDF está registrado en un almacenamiento privado que este navegador no puede leer.',
      )
    }
    const expectedHash = String(certificate.PdfHash || '').trim().toLowerCase()
    const existing = await withCertificateTimeout(
      this.store.get(reference),
      this.timeoutMs,
      CERTIFICATE_ARTIFACT_ERROR_CODES.STORAGE_TIMEOUT,
      'La búsqueda del PDF oficial no respondió a tiempo.',
    )
    if (existing) {
      const actualHash = await withCertificateTimeout(
        this.store.calculateHash(existing.blob),
        this.timeoutMs,
        CERTIFICATE_ARTIFACT_ERROR_CODES.STORAGE_TIMEOUT,
        'La verificación SHA-256 del certificado no respondió a tiempo.',
      )
      if (actualHash !== String(existing.hash || '').trim().toLowerCase() || (expectedHash && actualHash !== expectedHash)) {
        throw new CertificateArtifactError(
          CERTIFICATE_ARTIFACT_ERROR_CODES.HASH_MISMATCH,
          'La verificación SHA-256 del certificado falló. No se permitirá la descarga.',
        )
      }
      return { ...existing, reused: true }
    }
    if (expectedHash) {
      throw new CertificateArtifactError(
        CERTIFICATE_ARTIFACT_ERROR_CODES.ARTIFACT_NOT_LOCAL,
        'El PDF oficial existe, pero no está disponible en este navegador o dispositivo. No se regeneró ni sustituyó automáticamente.',
      )
    }
    if (/^legacy(?:-|$)/i.test(String(certificate.TemplateVersion || ''))) {
      throw new CertificateArtifactError(
        CERTIFICATE_ARTIFACT_ERROR_CODES.LEGACY_ARTIFACT_MISSING,
        'El certificado histórico no tiene su artefacto PDF original registrado. Debe migrarse o reemitirse de forma controlada; no se regeneró con la plantilla actual.',
      )
    }
    const generated = await withCertificateTimeout(
      this.buildPdf(certificate),
      this.timeoutMs,
      CERTIFICATE_ARTIFACT_ERROR_CODES.GENERATION_TIMEOUT,
      'La generación del certificado excedió el tiempo permitido.',
    )
    const hash = await withCertificateTimeout(
      this.store.calculateHash(generated.blob),
      this.timeoutMs,
      CERTIFICATE_ARTIFACT_ERROR_CODES.STORAGE_TIMEOUT,
      'El cálculo SHA-256 del certificado no respondió a tiempo.',
    )
    const record = {
      ...generated,
      reference,
      hash,
      certificateId: certificate.CertificatePublicId || certificate.ID,
      certificateVersion: Number(certificate.CertificateVersion) || 1,
      templateVersion: generated.templateVersion || certificate.TemplateVersion,
      createdAt: new Date().toISOString(),
    }
    await withCertificateTimeout(
      this.store.save(record),
      this.timeoutMs,
      CERTIFICATE_ARTIFACT_ERROR_CODES.STORAGE_TIMEOUT,
      'El guardado del PDF oficial excedió el tiempo permitido.',
    )
    return { ...record, reused: false }
  }
}

export const certificateArtifactStore = new BrowserIndexedDbCertificateArtifactStore()
