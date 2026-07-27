import QRCode from 'qrcode'
import { publicAppOrigin } from '../config/brand'

export function buildVerificationUrl(id) {
  return `${publicAppOrigin()}/verificar/${encodeURIComponent(id)}`
}

export function generateQrDataUrl(id) {
  return QRCode.toDataURL(buildVerificationUrl(id), {
    width: 400,
    margin: 1,
    errorCorrectionLevel: 'H',
  })
}
