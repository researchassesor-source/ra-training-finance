import { jsPDF } from 'jspdf'
import { buildVerificationUrl, generateQrDataUrl } from './qr.js'
import {
  deterministicCertificatePdfCreationDate,
  deterministicCertificatePdfFileId,
  formatLongDate,
  normalizeDuration,
  normalizeIssuedCertificate,
  validateCertificateData,
} from './certificateGenerator.js'

export const CERTIFICATE_V2_VERSION = 'ra-security-2026-v2'
const WIDTH = 320
const HEIGHT = 180
const NAVY = [8, 40, 82]
const ORANGE = [211, 117, 23]
const assets = {
  background: new URL('../assets/certificate/certificate-border-v2.png', import.meta.url).href,
  logo: new URL('../assets/certificate/ra-training-logo.png', import.meta.url).href,
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

function certificateWording(type) {
  switch (String(type || 'aprobacion').toLowerCase()) {
    case 'aprobacion':
      return { heading: 'DE APROBACIÓN', verb: 'Ha aprobado satisfactoriamente' }
    case 'asistencia':
      return { heading: 'DE ASISTENCIA', verb: 'Ha asistido a' }
    case 'participacion':
      return { heading: 'DE PARTICIPACIÓN', verb: 'Ha participado en' }
    default:
      throw new Error('El tipo de certificado no está configurado para esta plantilla.')
  }
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
  const issuerRuc = String(options.issuerRuc || '').trim()
  const issuerFile = String(options.issuerFile || '').trim()
  if (!/^\d{13}$/.test(issuerRuc) || !/^\d{4,12}$/.test(issuerFile)) {
    throw new Error('Falta confirmar el RUC y expediente oficiales del emisor.')
  }
  const directorSignature = requiredSignature(options.signatures?.director, 'Dirección Académica')
  const managerSignature = requiredSignature(options.signatures?.manager, 'Gerencia General')
  const type = certificateWording(certificate.CertificateType)
  const publicId = String(certificate.CertificatePublicId || certificate.ID)
  const verificationUrl = buildVerificationUrl(publicId)
  const [qr, background, logo, regular, bold, italic] = await Promise.all([
    generateQrDataUrl(publicId),
    ...Object.keys(assets).map(key => asDataUrl(key, options.assetDataUrls)),
  ])
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [WIDTH, HEIGHT], compress: true })
  pdf.setFileId(deterministicCertificatePdfFileId(`${publicId}|${certificate.CodigoCertificado}|${certificate.CertificateVersion || 1}|${CERTIFICATE_V2_VERSION}`))
  pdf.setCreationDate(deterministicCertificatePdfCreationDate(certificate.FechaEmisionCertificado))
  addFonts(pdf, { regular, bold, italic })
  pdf.addImage(background, 'PNG', 0, 0, WIDTH, HEIGHT)
  pdf.addImage(logo, 'PNG', 127, 5, 66, 21)
  pdf.setTextColor(...NAVY)
  line(pdf, 'RESEARCH ASSESSOR TRAINING S.A.S.', 31, 184, 14, 11, 'CertificatePlex', 'bold')
  line(pdf, `R.U.C.: ${issuerRuc} · Expediente: ${issuerFile}`, 36, 176, 10, 8)
  pdf.setTextColor(...ORANGE)
  line(pdf, 'CERTIFICADO', 51, 230, 40, 32, 'CertificatePlex', 'bold')
  line(pdf, type.heading, 60, 210, 25, 19, 'CertificatePlex', 'bold')
  pdf.setTextColor(...NAVY)
  line(pdf, 'Se certifica que:', 68, 180, 10, 9)
  line(pdf, String(certificate.ClienteNombre).trim(), 79, 194, 27, 17, 'CertificateName', 'italic')
  line(pdf, `Identificación: ${certificate.ClienteID}`, 86, 180, 11, 9)
  line(pdf, `${type.verb} la actividad académica:`, 94, 190, 12, 9)
  line(pdf, String(certificate.ServicioNombre).trim(), 103, 210, 24, 13, 'CertificatePlex', 'bold')
  const detail = `${normalizeDuration(certificate.Duracion)} · ${formatLongDate(certificate.FechaInicio)} al ${formatLongDate(certificate.FechaFin)} · Modalidad ${certificate.Modalidad}`
  line(pdf, detail, 110, 222, 10, 7)
  line(pdf, 'En constancia de lo anterior, se expide el presente documento digital verificable.', 121, 230, 10, 8)
  line(pdf, `Riobamba, ${formatLongDate(certificate.FechaEmisionCertificado)}`, 127, 200, 10, 8, 'CertificatePlex', 'bold')

  pdf.addImage(directorSignature, 'PNG', 74, 132, 49, 13)
  pdf.addImage(managerSignature, 'PNG', 194, 132, 49, 13)
  pdf.setDrawColor(...NAVY)
  pdf.line(68, 146, 128, 146)
  pdf.line(190, 146, 250, 146)
  pdf.setFont('CertificatePlex', 'bold')
  pdf.setFontSize(10)
  pdf.text('Mgs. Edison Bonifaz A.', 98, 151, { align: 'center' })
  pdf.text('Mgs. Alexandra Villagómez', 220, 151, { align: 'center' })
  pdf.setFont('CertificatePlex', 'normal')
  pdf.setFontSize(8)
  pdf.text('Dirección Académica', 98, 155, { align: 'center' })
  pdf.text('Gerencia General', 220, 155, { align: 'center' })
  pdf.addImage(qr, 'PNG', 267, 118, 31, 31)
  pdf.link(267, 118, 31, 31, { url: verificationUrl })
  pdf.setFontSize(8)
  pdf.text(String(certificate.CodigoCertificado), 282.5, 153, { align: 'center' })
  pdf.setFont('CertificatePlex', 'bold')
  pdf.setFontSize(8)
  pdf.text(`Código único: ${certificate.CodigoCertificado} · Versión ${certificate.CertificateVersion || 1}`, 285, 29, { align: 'right' })
  pdf.setFont('CertificatePlex', 'normal')
  pdf.text('Documento digital con trazabilidad', 285, 33, { align: 'right' })
  pdf.text('Documento digital verificable · ra-training.com/verificar', 160, 169, { align: 'center' })
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
