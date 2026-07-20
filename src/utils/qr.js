import QRCode from 'qrcode'

export function buildVerificationUrl(id) {
  return `${window.location.origin}/verificar/${id}`
}

export function generateQrDataUrl(id) {
  return QRCode.toDataURL(buildVerificationUrl(id), {
    width: 400,
    margin: 1,
    errorCorrectionLevel: 'H',
  })
}
