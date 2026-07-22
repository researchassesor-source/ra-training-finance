import QRCode from 'qrcode'

export function buildVerificationUrl(id) {
  const configured = String(import.meta.env?.VITE_PUBLIC_APP_URL || '').trim()
  const browserOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
  const origin = configured || browserOrigin
  return `${origin.replace(/\/$/, '')}/verificar/${encodeURIComponent(id)}`
}

export function generateQrDataUrl(id) {
  return QRCode.toDataURL(buildVerificationUrl(id), {
    width: 400,
    margin: 1,
    errorCorrectionLevel: 'H',
  })
}
