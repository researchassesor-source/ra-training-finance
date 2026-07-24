import type { DocumentType, FiscalDocument, FiscalEvent, FiscalStatus, SriTransmission } from '../domain/types.js'

export interface FiscalRepository {
  listDocuments(): Promise<FiscalDocument[]>
  getDocument(id: string): Promise<FiscalDocument | undefined>
  findBySource(documentType: DocumentType, sourceId: string): Promise<FiscalDocument | undefined>
  findByAccessKey(accessKey: string): Promise<FiscalDocument | undefined>
  saveDocument(document: FiscalDocument): Promise<void>
  reserveSequential(documentType: DocumentType, establishmentCode: string, emissionPointCode: string): Promise<string>
  addEvent(event: FiscalEvent): Promise<void>
  listEvents(documentId: string): Promise<FiscalEvent[]>
  addTransmission(transmission: SriTransmission): Promise<void>
  listTransmissions(documentId: string): Promise<SriTransmission[]>
  rememberIdempotency(key: string, resourceId: string): Promise<void>
  resolveIdempotency(key: string): Promise<string | undefined>
}

export type TransitionContext = {
  status: FiscalStatus
  actor: string
  eventType: string
  details?: Record<string, unknown>
}
