const DB_NAME = 'ra-training-certificate-artifacts'
const STORE_NAME = 'pdf-artifacts'
const DB_VERSION = 1

function asArrayBuffer(value) {
  if (value instanceof Blob) {
    if (typeof value.arrayBuffer === 'function') return value.arrayBuffer()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('No se pudo leer el artefacto PDF para verificarlo.'))
      reader.readAsArrayBuffer(value)
    })
  }
  if (value instanceof ArrayBuffer) return Promise.resolve(value)
  if (ArrayBuffer.isView(value)) {
    return Promise.resolve(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength))
  }
  throw new Error('El artefacto del certificado no contiene datos binarios válidos.')
}

export async function sha256Hex(value) {
  const data = await asArrayBuffer(value)
  if (!globalThis.crypto?.subtle) {
    throw new Error('Este navegador no permite verificar la integridad SHA-256 del certificado.')
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export function artifactReferenceFor(certificate) {
  const publicId = String(certificate.CertificatePublicId || certificate.ReissuedCertificateId || certificate.ID || '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
  const version = Number(certificate.CertificateVersion) || 1
  if (!publicId) throw new Error('El certificado no tiene un identificador público para almacenar su PDF.')
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
      throw new Error('El artefacto PDF es inmutable y no puede sobrescribirse.')
    }
    this.records.set(record.reference, record)
    return record
  }
}

export class BrowserIndexedDbCertificateArtifactStore extends CertificateArtifactStore {
  constructor(indexedDb = globalThis.indexedDB) {
    super()
    this.indexedDb = indexedDb
    this.dbPromise = null
  }

  open() {
    if (!this.indexedDb) {
      return Promise.reject(new Error('El navegador no dispone del almacenamiento privado requerido para certificados.'))
    }
    if (this.dbPromise) return this.dbPromise
    this.dbPromise = new Promise((resolve, reject) => {
      const request = this.indexedDb.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'reference' })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error('No se pudo abrir el almacenamiento privado de certificados.'))
    })
    return this.dbPromise
  }

  async get(reference) {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(reference)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(new Error('No se pudo leer el artefacto privado del certificado.'))
    })
  }

  async save(record) {
    const current = await this.get(record.reference)
    if (current && current.hash !== record.hash) {
      throw new Error('El artefacto PDF es inmutable y no puede sobrescribirse.')
    }
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(record)
      request.onsuccess = () => resolve(record)
      request.onerror = () => reject(new Error('No se pudo guardar el artefacto privado del certificado.'))
    })
  }
}

export class CertificatePdfRepository {
  constructor({ store, buildPdf }) {
    this.store = store
    this.buildPdf = buildPdf
  }

  async prepare(certificate) {
    const reference = String(certificate.PdfStorageReference || artifactReferenceFor(certificate))
    if (!reference.startsWith('browser-indexeddb:') && !reference.startsWith('test-memory:')) {
      throw new Error('El PDF está registrado en un almacenamiento privado que este adaptador no puede leer.')
    }
    const expectedHash = String(certificate.PdfHash || '').trim().toLowerCase()
    const existing = await this.store.get(reference)
    if (existing) {
      const actualHash = await this.store.calculateHash(existing.blob)
      if (actualHash !== existing.hash || (expectedHash && !(await this.store.verifyHash(existing.blob, expectedHash)))) {
        throw new Error('La verificación SHA-256 del certificado falló. No se permitirá la descarga.')
      }
      return { ...existing, reused: true }
    }
    if (expectedHash) {
      throw new Error('El PDF oficial no está disponible en este dispositivo. No se regenerará ni sustituirá automáticamente.')
    }
    if (/^legacy(?:-|$)/i.test(String(certificate.TemplateVersion || ''))) {
      throw new Error('El certificado histórico no tiene su artefacto PDF original registrado. Debe recuperarse e importarse de forma controlada; no se regenerará con la plantilla actual.')
    }
    const generated = await this.buildPdf(certificate)
    const hash = await this.store.calculateHash(generated.blob)
    const record = {
      ...generated,
      reference,
      hash,
      certificateId: certificate.CertificatePublicId || certificate.ID,
      certificateVersion: Number(certificate.CertificateVersion) || 1,
      templateVersion: generated.templateVersion || certificate.TemplateVersion,
      createdAt: new Date().toISOString(),
    }
    await this.store.save(record)
    return { ...record, reused: false }
  }
}

export const certificateArtifactStore = new BrowserIndexedDbCertificateArtifactStore()
