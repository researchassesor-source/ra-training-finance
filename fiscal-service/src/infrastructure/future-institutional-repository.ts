import type { FiscalRepository } from '../application/repository.js'
import type { DocumentType, FiscalDocument, FiscalEvent, SriTransmission } from '../domain/types.js'

const pendingProvider = (): Error => new Error('El proveedor institucional de persistencia fiscal aún no está configurado')

/**
 * Boundary reserved for a future institutional provider. It intentionally performs
 * no I/O until retention, locking, audit and backup guarantees are approved.
 */
export class FutureInstitutionalFiscalRepository implements FiscalRepository {
  listDocuments(): Promise<FiscalDocument[]> { return Promise.reject(pendingProvider()) }
  getDocument(_id: string): Promise<FiscalDocument | undefined> { return Promise.reject(pendingProvider()) }
  findBySource(_type: DocumentType, _sourceId: string): Promise<FiscalDocument | undefined> { return Promise.reject(pendingProvider()) }
  findByAccessKey(_accessKey: string): Promise<FiscalDocument | undefined> { return Promise.reject(pendingProvider()) }
  saveDocument(_document: FiscalDocument): Promise<void> { return Promise.reject(pendingProvider()) }
  reserveSequential(_type: DocumentType, _establishment: string, _point: string): Promise<string> { return Promise.reject(pendingProvider()) }
  addEvent(_event: FiscalEvent): Promise<void> { return Promise.reject(pendingProvider()) }
  listEvents(_documentId: string): Promise<FiscalEvent[]> { return Promise.reject(pendingProvider()) }
  addTransmission(_transmission: SriTransmission): Promise<void> { return Promise.reject(pendingProvider()) }
  listTransmissions(_documentId: string): Promise<SriTransmission[]> { return Promise.reject(pendingProvider()) }
  rememberIdempotency(_key: string, _resourceId: string): Promise<void> { return Promise.reject(pendingProvider()) }
  resolveIdempotency(_key: string): Promise<string | undefined> { return Promise.reject(pendingProvider()) }
}
