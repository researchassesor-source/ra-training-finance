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
    if (certificate.PdfHash || certificate.PdfStorageReference || prepared.historicalArtifact) {
      const canMoveOfficialLocalCopy = Boolean(
        prepared.reused
        && certificate.PdfHash
        && (!reference || reference.startsWith('browser-indexeddb:'))
        && prepared.blob,
      )
      if (!canMoveOfficialLocalCopy) return prepared

      const officialHash = String(certificate.PdfHash).trim().toLowerCase()
      const localHash = await sha256Hex(prepared.blob)
      if (localHash !== officialHash) throw new Error('El PDF local no coincide con la huella oficial; no se descargó ni migró.')
      try {
        const archived = await api.migrarPdfCertificadoPrivado(certificate.InscripcionID || certificate.ID, {
          certificateId: certificate.CertificatePublicId || certificate.ID,
          pdfBase64: await blobToBase64(prepared.blob),
          pdfHash: officialHash,
          templateVersion: prepared.templateVersion || certificate.TemplateVersion || 'legacy-v1',
          certificateVersion: Number(prepared.certificateVersion || certificate.CertificateVersion) || 1,
          motivo: 'Migración del PDF original idéntico a la huella oficial para archivarlo de forma central.',
          confirmacion: 'MIGRAR_PDF_ORIGINAL',
        })
        if (!archived.reference?.startsWith('certificate-drive:') || archived.hash !== officialHash) {
          throw new Error('El servidor no confirmó el archivo central del PDF original.')
        }
        return { ...prepared, reference: archived.reference, hash: officialHash }
      } catch (error) {
        // Una falla al centralizar no impide entregar el PDF original verificado que sí existe localmente.
        return { ...prepared, archiveWarning: error.message || 'No se pudo centralizar el PDF original.' }
      }
    }

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
