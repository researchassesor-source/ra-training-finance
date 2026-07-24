import type { FiscalDocument } from '../../domain/types.js'
import type { FiscalStorageProvider } from '../../infrastructure/file-storage.js'

export interface FiscalDocumentMailer {
  preview(document: FiscalDocument): Promise<string>
  simulate(document: FiscalDocument, action: 'SEND' | 'RESEND', outcome: 'SUCCESS' | 'ERROR'): Promise<string>
}

export class FileFiscalMailer implements FiscalDocumentMailer {
  constructor(private readonly storage: FiscalStorageProvider) {}
  async preview(document: FiscalDocument): Promise<string> {
    const body = [
      'ENVÍO SIMULADO - NO SE ENVIÓ NINGÚN CORREO',
      `Para: ${document.customer.email}`,
      `Asunto: Comprobante local ${document.establishmentCode}-${document.emissionPointCode}-${document.sequential ?? 'PENDIENTE'}`,
      `Mensaje: Se adjunta el XML y la representación RIDE generados en el ambiente local de demostración.`,
      `Número: ${document.establishmentCode}-${document.emissionPointCode}-${document.sequential ?? 'PENDIENTE'}`,
      `Clave: ${document.accessKey ?? 'PENDIENTE'}`,
      `Estado: ${document.sriStatus ?? document.status}`,
      `XML conceptual: ${document.authorizedXmlPath ? 'adjunto disponible' : 'pendiente'}`,
      `RIDE conceptual: ${document.ridePath ? 'adjunto disponible' : 'pendiente'}`,
      'Advertencia: documento sin validez tributaria.',
    ].join('\n')
    const stored = await this.storage.write(document.id, document.documentType, document.issueDate, 'delivery/email-preview.txt', body)
    return stored.relativePath
  }

  async simulate(document: FiscalDocument, action: 'SEND' | 'RESEND', outcome: 'SUCCESS' | 'ERROR'): Promise<string> {
    if (outcome === 'ERROR') throw new Error('Error de entrega simulado; no se realizó ninguna conexión')
    const body = [
      `${action === 'SEND' ? 'ENVÍO' : 'REENVÍO'} SIMULADO - NO SE ENVIÓ NINGÚN CORREO`,
      `Documento: ${document.establishmentCode}-${document.emissionPointCode}-${document.sequential ?? 'PENDIENTE'}`,
      `Estado: ${document.sriStatus ?? document.status}`,
      `XML: ${document.authorizedXmlPath ? 'adjunto conceptual disponible' : 'pendiente'}`,
      `RIDE: ${document.ridePath ? 'adjunto conceptual disponible' : 'pendiente'}`,
    ].join('\n')
    const filename = action === 'SEND' ? 'email-send-simulated.txt' : 'email-resend-simulated.txt'
    const stored = await this.storage.write(document.id, document.documentType, document.issueDate, `delivery/${filename}`, body)
    return stored.relativePath
  }
}

export interface FutureFiscalMailer extends FiscalDocumentMailer {
  readonly requiresPrivateCredentials: true
  send(document: FiscalDocument, correlationId: string): Promise<{ providerId: string; delivered: boolean }>
  resend(document: FiscalDocument, correlationId: string): Promise<{ providerId: string; delivered: boolean }>
}
