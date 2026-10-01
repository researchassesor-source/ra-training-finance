import {
  certificateArtifactStore,
  CertificatePdfRepository,
  sha256Hex,
} from './certificateArtifactStore'
import { buildCertificatePdf } from '../utils/certificateGenerator'
import { blobToBase64 } from '../utils/blob'
import { api } from './api'

const browserRepository = new CertificatePdfRepository({
  store: certificateArtifactStore,
  buildPdf: buildCertificatePdf,
})

function archivedPdfBlob(contentBase64) {
  const binary = atob(String(contentBase64 || ''))
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  return new Blob([bytes], { type: 'application/pdf' })
}

export const certificatePdfRepository = {
  async prepare(certificate, options = {}) {
    const reference = String(certificate.PdfStorageReference || '').trim()
    if (reference.startsWith('certificate-drive:')) {
      const archived = await api.leerPdfCertificadoPrivado(certificate.CertificatePublicId || certificate.ID)
      if (archived.reference !== reference || String(archived.hash || '').toLowerCase() !== String(certificate.PdfHash || '').toLowerCase()) {
        throw new Error('La referencia o la huella del certificado privado no coincide con el registro oficial.')
      }
      const blob = archivedPdfBlob(archived.contentBase64)
      if (await sha256Hex(blob) !== String(certificate.PdfHash).toLowerCase()) {
        throw new Error('El PDF privado no superó la verificación SHA-256.')
      }
      return {
        blob,
        filename: archived.filename,
        reference,
        hash: String(certificate.PdfHash).toLowerCase(),
        templateVersion: certificate.TemplateVersion,
        certificateVersion: Number(certificate.CertificateVersion) || 1,
        reused: true,
      }
    }

    const needsNewV2Pdf = ['ra-security-2026-v2', 'ra-security-2026-v3'].includes(certificate.TemplateVersion)
      && !certificate.PdfHash && !certificate.PdfStorageReference
    const generationOptions = needsNewV2Pdf
      ? { ...options, signatures: (await api.getFirmasOficialesCertificado({ templateVersion: certificate.TemplateVersion })).signatures }
      : options
    const prepared = await browserRepository.prepare(certificate, generationOptions)
    if (certificate.PdfHash || certificate.PdfStorageReference || prepared.historicalArtifact) return prepared

    const archived = await api.guardarPdfCertificadoPrivado(certificate.CertificatePublicId || certificate.ID, {
      pdfBase64: await blobToBase64(prepared.blob),
      pdfHash: prepared.hash,
      templateVersion: prepared.templateVersion,
      certificateVersion: prepared.certificateVersion,
    })
    if (!archived.reference?.startsWith('certificate-drive:') || archived.hash !== prepared.hash) {
      throw new Error('El servidor no confirmó el archivo privado del certificado.')
    }
    return { ...prepared, reference: archived.reference }
  },
}
