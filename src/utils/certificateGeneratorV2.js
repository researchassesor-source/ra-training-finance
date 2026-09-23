import { jsPDF } from 'jspdf'
import { buildVerificationUrl, generateQrDataUrl } from './qr.js'
import { participantCertificateType } from '../config/certificateTypes.js'
import {
  deterministicCertificatePdfCreationDate,
  deterministicCertificatePdfFileId,
  formatLongDate,
  normalizeDuration,
  normalizeIssuedCertificate,
  validateCertificateData,
} from './certificateGenerator.js'

export const CERTIFICATE_V2_VERSION = 'ra-security-2026-v2'
export const CERTIFICATE_V2_ISSUER = Object.freeze({ ruc: '0691787373001', expediente: '401111' })
const WIDTH = 320
const HEIGHT = 180
const NAVY = [8, 40, 82]
const ORANGE = [211, 117, 23]
const assets = {
  background: new URL('../assets/certificate/certificate-border-v2.png', import.meta.url).href,
  logo: new URL('../assets/certificate/ra-training-logo.png', import.meta.url).href,
  seal: new URL('../assets/certificate/academic-seal.png', import.meta.url).href,
  regular: new URL('../assets/certificate/canva/IBMPlexSansCondensed-Regular.ttf', import.meta.url).href,
  bold: new URL('../assets/certificate/canva/IBMPlexSansCondensed-Bold.ttf', import.meta.url).href,
  italic: new URL('../assets/certificate/canva/OpenSansCondensed-MediumItalic.ttf', import.meta.url).href,
}
const cache = new Map()

async function asDataUrl(key, overrides) {
  if (overrides?.[key]) return overrides[key]
  if (cache.has(key)) return cache.get(key)
  const response = await fetch(assets[key])
  if (!response.ok) throw new Error(`No se pudo cargar el recurso ${key} del certificado.`)
  const blob = await response.blob()
  const value = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error(`No se pudo leer el recurso ${key} del certificado.`))
    reader.readAsDataURL(blob)
  })
  cache.set(key, value)
  return value
}

function base64(value) {
  const comma = String(value).indexOf(',')
  if (comma < 0) throw new Error('Recurso de certificado inválido.')
  return String(value).slice(comma + 1)
}

function addFonts(pdf, resource) {
  const definitions = [
    ['regular', 'Plex-Regular.ttf', 'normal'],
    ['bold', 'Plex-Bold.ttf', 'bold'],
    ['italic', 'Name-Italic.ttf', 'italic'],
  ]
  definitions.forEach(([key, filename, style]) => {
    pdf.addFileToVFS(filename, base64(resource[key]))
    pdf.addFont(filename, key === 'italic' ? 'CertificateName' : 'CertificatePlex', style)
  })
}

function line(pdf, text, y, maxWidth, initialSize, minSize, family = 'CertificatePlex', style = 'normal') {
  pdf.setFont(family, style)
  for (let size = initialSize; size >= minSize; size -= 0.5) {
    pdf.setFontSize(size)
    if (pdf.getTextWidth(text) <= maxWidth) {
      pdf.text(text, WIDTH / 2, y, { align: 'center' })
      return
    }
  }
  throw new Error('El texto del certificado no cabe en la plantilla oficial; revise el contenido.')
}

function signatureInBox(pdf, dataUrl, x, y, width, height) {
  const image = pdf.getImageProperties(dataUrl)
  const scale = Math.min(width / image.width, height / image.height)
  const drawnWidth = image.width * scale
  const drawnHeight = image.height * scale
  pdf.addImage(dataUrl, 'PNG', x + (width - drawnWidth) / 2, y + (height - drawnHeight) / 2, drawnWidth, drawnHeight)
}

function diamond(pdf, x, y, size) {
  pdf.triangle(x, y - size, x + size, y, x, y + size, 'F')
  pdf.triangle(x, y - size, x - size, y, x, y + size, 'F')
}

function requiredSignature(value, label) {
  if (!/^data:image\/png;base64,[a-z0-9+/]+=*$/i.test(String(value || ''))) {
    throw new Error(`Falta la firma oficial aprobada de ${label}. No se emitirá el nuevo certificado.`)
  }
  return value
}

export async function buildCertificateV2Pdf(record, options = {}) {
  if (record?.TemplateVersion !== CERTIFICATE_V2_VERSION) throw new Error('Versión de plantilla incorrecta.')
  const certificate = normalizeIssuedCertificate(record)
  const missing = validateCertificateData(certificate)
  if (missing.length) throw new Error(`Faltan datos para el certificado: ${missing.join(', ')}.`)
  const status = String(certificate.CertificateStatus || certificate.EstadoCertificado || '').toLowerCase()
  if (!['emitido', 'enviado', 'reemitido'].includes(status) || !certificate.CodigoCertificado || !certificate.FechaEmisionCertificado) {
    throw new Error('El certificado debe estar emitido oficialmente antes de generar el PDF.')
  }
  const issuerRuc = String(options.issuerRuc ?? CERTIFICATE_V2_ISSUER.ruc).trim()
  const issuerFile = String(options.issuerFile ?? CERTIFICATE_V2_ISSUER.expediente).trim()
  if (!/^\d{13}$/.test(issuerRuc) || !/^\d{4,12}$/.test(issuerFile)) {
    throw new Error('Falta confirmar el RUC y expediente oficiales del emisor.')
  }
  const directorSignature = requiredSignature(options.signatures?.director, 'Dirección Académica')
  const managerSignature = requiredSignature(options.signatures?.manager, 'Gerencia General')
  const type = participantCertificateType(certificate.CertificateType)
  const publicId = String(certificate.CertificatePublicId || certificate.ID)
  const verificationUrl = buildVerificationUrl(publicId)
  const [qr, background, logo, seal, regular, bold, italic] = await Promise.all([
    generateQrDataUrl(publicId),
    ...Object.keys(assets).map(key => asDataUrl(key, options.assetDataUrls)),
  ])
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [WIDTH, HEIGHT], compress: true })
  pdf.setFileId(deterministicCertificatePdfFileId(`${publicId}|${certificate.CodigoCertificado}|${certificate.CertificateVersion || 1}|${CERTIFICATE_V2_VERSION}`))
  pdf.setCreationDate(deterministicCertificatePdfCreationDate(certificate.FechaEmisionCertificado))
  addFonts(pdf, { regular, bold, italic })
  pdf.addImage(background, 'PNG', 0, 0, WIDTH, HEIGHT)
  pdf.addImage(logo, 'PNG', 132, 5, 56, 24)
  pdf.setFont('times', 'bold')
  pdf.setFontSize(146)
  pdf.setTextColor(240, 246, 251)
  pdf.text('R', 189, 119)
  pdf.setTextColor(...NAVY)
  line(pdf, 'RESEARCH ASSESSOR TRAINING S.A.S.', 33, 180, 13, 10, 'CertificatePlex', 'bold')
  line(pdf, `R.U.C.: ${issuerRuc} · Expediente: ${issuerFile}`, 38, 180, 11, 8)
  pdf.setDrawColor(...ORANGE)
  pdf.setLineWidth(0.35)
  pdf.line(66, 47, 94, 47)
  pdf.line(226, 47, 254, 47)
  pdf.setTextColor(...ORANGE)
  diamond(pdf, 98, 47, 1.3)
  diamond(pdf, 222, 47, 1.3)
  pdf.setTextColor(...NAVY)
  line(pdf, 'CERTIFICADO', 53, 170, 47, 37, 'times', 'bold')
  pdf.setTextColor(...ORANGE)
  line(pdf, type.heading, 63, 165, 28, 22, 'times', 'bold')
  pdf.setTextColor(...NAVY)
  line(pdf, 'Se certifica que:', 70, 180, 11, 9)
  line(pdf, String(certificate.ClienteNombre).trim(), 81, 195, 30, 18, 'times', 'italic')
  line(pdf, `Cédula de Identidad: ${certificate.ClienteID}`, 87, 185, 11, 9)
  line(pdf, type.intro, 94, 190, 11, 9)
  line(pdf, String(certificate.ServicioNombre).trim(), 102, 205, 24, 13, 'times', 'bold')
  line(pdf, `con una duración de ${normalizeDuration(certificate.Duracion)}, desarrollado desde`, 109, 190, 10, 8)
  line(pdf, `el ${formatLongDate(certificate.FechaInicio)} hasta el ${formatLongDate(certificate.FechaFin)}, bajo la modalidad`, 114, 194, 10, 8)
  line(pdf, `${certificate.Modalidad}.`, 119, 185, 10, 8)
  line(pdf, 'En constancia de lo anterior, se expide el presente certificado', 127, 202, 10, 8)
  line(pdf, 'para los fines que el interesado considere pertinentes.', 132, 200, 10, 8)
  line(pdf, `Riobamba, ${formatLongDate(certificate.FechaEmisionCertificado)}`, 138, 185, 10, 8, 'CertificatePlex', 'bold')

  signatureInBox(pdf, directorSignature, 76, 139, 49, 11)
  signatureInBox(pdf, managerSignature, 195, 139, 49, 11)
  pdf.addImage(seal, 'PNG', 143, 139, 34, 29)
  pdf.setDrawColor(...NAVY)
  pdf.setLineWidth(0.25)
  pdf.line(74, 150, 128, 150)
  pdf.line(192, 150, 246, 150)
  pdf.setFont('CertificatePlex', 'bold')
  pdf.setFontSize(11)
  pdf.text('Mgs. Edison Bonifaz A.', 101, 156, { align: 'center' })
  pdf.text('Mgs. Alexandra Villagómez', 219, 156, { align: 'center' })
  pdf.setFont('CertificatePlex', 'normal')
  pdf.setTextColor(...ORANGE)
  pdf.setFontSize(9)
  pdf.text('Director Académico', 101, 161, { align: 'center' })
  pdf.text('Gerente General', 219, 161, { align: 'center' })
  pdf.setDrawColor(...ORANGE)
  pdf.setLineWidth(0.4)
  pdf.roundedRect(261, 103, 49, 61, 3, 3)
  pdf.setFont('CertificatePlex', 'bold')
  pdf.setTextColor(...NAVY)
  pdf.setFontSize(12)
  pdf.text('VERIFICACIÓN', 285.5, 110, { align: 'center' })
  pdf.addImage(qr, 'PNG', 270.5, 113, 30, 30)
  pdf.link(270.5, 113, 30, 30, { url: verificationUrl })
  pdf.setFontSize(8)
  pdf.text(String(certificate.CodigoCertificado), 285.5, 149, { align: 'center' })
  pdf.setFont('CertificatePlex', 'normal')
  pdf.setFontSize(8)
  pdf.text('Verificación en:', 285.5, 155, { align: 'center' })
  pdf.setFont('CertificatePlex', 'bold')
  pdf.text('ra-training.com/verificar', 285.5, 159.5, { align: 'center' })
  pdf.setFontSize(8)
  pdf.text(`Código único: ${certificate.CodigoCertificado}`, 285, 24, { align: 'right' })
  pdf.setFont('CertificatePlex', 'normal')
  pdf.text('Documento digital con trazabilidad', 285, 28.5, { align: 'right' })
  pdf.setFillColor(...NAVY)
  pdf.roundedRect(126, 166, 68, 14, 2, 2, 'F')
  pdf.setDrawColor(255, 255, 255)
  pdf.setLineWidth(0.3)
  pdf.circle(142, 172.6, 2.8)
  pdf.ellipse(142, 172.6, 1.3, 2.8)
  pdf.line(139.2, 172.6, 144.8, 172.6)
  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(12)
  pdf.text('ra-training.com', 168, 174, { align: 'center' })
  pdf.setTextColor(...NAVY)
  pdf.setFontSize(5.5)
  pdf.text(`RESEARCH ASSESSOR TRAINING S.A.S. · R.U.C. ${issuerRuc} · EXPEDIENTE ${issuerFile} · DOCUMENTO DIGITAL VERIFICABLE`, 66, 173, { align: 'center' })
  pdf.text('DOCUMENTO DIGITAL VERIFICABLE · RESEARCH ASSESSOR TRAINING S.A.S.', 253, 173, { align: 'center' })
  pdf.setProperties({ title: `Certificado ${certificate.CodigoCertificado}`, subject: certificate.ServicioNombre, author: 'Research Assessor Training S.A.S.' })
  const safeName = String(certificate.ClienteNombre).replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]+/g, '_')
  return {
    blob: pdf.output('blob'),
    filename: `certificado_${safeName}_${certificate.CertificateVersion || 1}.pdf`,
    verificationUrl,
    certificateCode: certificate.CodigoCertificado,
    templateVersion: CERTIFICATE_V2_VERSION,
  }
}
