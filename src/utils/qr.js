import QRCode from 'qrcode'
import { getCertificatePublicBaseUrl } from '../config/brand.js'

export function buildVerificationUrl(id) {
  return `${getCertificatePublicBaseUrl()}/verificar/${encodeURIComponent(id)}`
}

export function generateQrDataUrl(id) {
  return QRCode.toDataURL(buildVerificationUrl(id), {
    width: 400,
    margin: 1,
    errorCorrectionLevel: 'H',
  })
}
