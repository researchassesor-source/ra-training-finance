import type { FiscalRepository } from '../application/repository.js'
import type { DocumentType, FiscalDocument, FiscalEvent, SriTransmission } from '../domain/types.js'

export class InMemoryFiscalRepository implements FiscalRepository {
  private readonly documents = new Map<string, FiscalDocument>()
  private readonly events: FiscalEvent[] = []
  private readonly transmissions: SriTransmission[] = []
  private readonly sequences = new Map<string, number>()
  private readonly idempotency = new Map<string, string>()
  private sequenceQueue: Promise<void> = Promise.resolve()

  async listDocuments(): Promise<FiscalDocument[]> {
    return structuredClone([...this.documents.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
  }

  async getDocument(id: string): Promise<FiscalDocument | undefined> {
    const item = this.documents.get(id)
    return item ? structuredClone(item) : undefined
  }

  async findBySource(documentType: DocumentType, sourceId: string): Promise<FiscalDocument | undefined> {
    const item = [...this.documents.values()].find((doc) => doc.documentType === documentType && doc.sourceId === sourceId)
    return item ? structuredClone(item) : undefined
  }

  async findByAccessKey(accessKey: string): Promise<FiscalDocument | undefined> {
    const item = [...this.documents.values()].find((doc) => doc.accessKey === accessKey)
    return item ? structuredClone(item) : undefined
  }

  async saveDocument(document: FiscalDocument): Promise<void> {
    const duplicateSource = document.documentType === 'INVOICE' ? [...this.documents.values()].find((item) =>
      item.id !== document.id && item.documentType === document.documentType && item.sourceId === document.sourceId) : undefined
    if (duplicateSource) throw new Error('Ya existe una factura para esta fuente')
    if (document.accessKey) {
      const duplicateKey = [...this.documents.values()].find((item) => item.id !== document.id && item.accessKey === document.accessKey)
      if (duplicateKey) throw new Error('La clave de acceso ya existe')
    }
    this.documents.set(document.id, structuredClone(document))
  }

  async reserveSequential(type: DocumentType, establishmentCode: string, emissionPointCode: string): Promise<string> {
    let release: () => void = () => undefined
    const previous = this.sequenceQueue
    this.sequenceQueue = new Promise<void>((resolve) => { release = resolve })
    await previous
    try {
      const key = `${type}:${establishmentCode}:${emissionPointCode}`
      const next = (this.sequences.get(key) ?? 0) + 1
      if (next > 999_999_999) throw new Error('Secuencial agotado')
      this.sequences.set(key, next)
      return String(next).padStart(9, '0')
    } finally {
      release()
    }
  }

  async addEvent(event: FiscalEvent): Promise<void> { this.events.push(structuredClone(event)) }
  async listEvents(documentId: string): Promise<FiscalEvent[]> {
    return structuredClone(this.events.filter((item) => item.documentId === documentId))
  }
  async addTransmission(transmission: SriTransmission): Promise<void> { this.transmissions.push(structuredClone(transmission)) }
  async listTransmissions(documentId: string): Promise<SriTransmission[]> {
    return structuredClone(this.transmissions.filter((item) => item.documentId === documentId))
  }
  async rememberIdempotency(key: string, resourceId: string): Promise<void> {
    const existing = this.idempotency.get(key)
    if (existing && existing !== resourceId) throw new Error('Idempotency-Key ya pertenece a otra operación')
    this.idempotency.set(key, resourceId)
  }
  async resolveIdempotency(key: string): Promise<string | undefined> { return this.idempotency.get(key) }
}
