import type { FiscalDocument } from '../../domain/types.js'
import type { FiscalFileStorage } from '../../infrastructure/file-storage.js'

export interface FiscalDocumentMailer {
  preview(document: FiscalDocument): Promise<string>
}

export class FileFiscalMailer implements FiscalDocumentMailer {
  constructor(private readonly storage: FiscalFileStorage) {}
  async preview(document: FiscalDocument): Promise<string> {
    const body = [
      'ENVÍO SIMULADO - NO SE ENVIÓ NINGÚN CORREO',
      `Para: ${document.customer.email}`,
      `Asunto: Comprobante local ${document.establishmentCode}-${document.emissionPointCode}-${document.sequential ?? 'PENDIENTE'}`,
      `XML conceptual: ${document.authorizedXmlPath ? 'adjunto disponible' : 'pendiente'}`,
      `RIDE conceptual: ${document.ridePath ? 'adjunto disponible' : 'pendiente'}`,
      'Advertencia: documento sin validez tributaria.',
    ].join('\n')
    const stored = await this.storage.write(document.id, document.documentType, document.issueDate, 'delivery/email-preview.txt', body)
    return stored.relativePath
  }
}

export interface FutureFiscalMailer extends FiscalDocumentMailer {
  readonly requiresPrivateCredentials: true
}
