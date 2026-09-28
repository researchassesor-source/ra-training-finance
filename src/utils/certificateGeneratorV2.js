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
export const CERTIFICATE_ITSAL_VERSION = 'ra-itsal-security-2026-v1'
export const CERTIFICATE_V2_ISSUER = Object.freeze({ ruc: '0691787373001', expediente: '401111' })
const WIDTH = 320
const HEIGHT = 180
const NAVY = [8, 40, 82]
const ORANGE = [211, 117, 23]
const assets = {
  background: new URL('../assets/certificate/certificate-border-v2.png', import.meta.url).href,
  logo: new URL('../assets/certificate/ra-training-logo.png', import.meta.url).href,
  mark: new URL('../assets/certificate/ra-training-mark.png', import.meta.url).href,
  seal: new URL('../assets/certificate/academic-seal.png', import.meta.url).href,
  itsal: new URL('../assets/certificate/itsal-official-logo.png', import.meta.url).href,
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

function fittedText(pdf, text, x, y, maxWidth, initialSize, minSize, style = 'normal') {
  pdf.setFont('CertificatePlex', style)
  for (let size = initialSize; size >= minSize; size -= 0.25) {
    pdf.setFontSize(size)
    if (pdf.getTextWidth(text) <= maxWidth) {
      pdf.text(text, x, y, { align: 'center' })
      return
    }
  }
  throw new Error('El microtexto de seguridad no cabe en la plantilla oficial.')
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

function verifiedRegisterBadge(pdf) {
  pdf.setFillColor(...NAVY)
  pdf.roundedRect(239.3, 32.1, 5.2, 5.1, 0.7, 0.7, 'F')
  pdf.triangle(239.3, 35.7, 244.5, 35.7, 241.9, 39.4, 'F')
  pdf.setDrawColor(255, 255, 255)
  pdf.setLineWidth(0.35)
  pdf.ellipse(241.9, 34.1, 0.7, 0.95, 'S')
  pdf.setFillColor(255, 255, 255)
  pdf.roundedRect(240.9, 34.2, 2, 2, 0.25, 0.25, 'F')
  pdf.setFillColor(...NAVY)
  pdf.circle(241.9, 35, 0.2, 'F')
}

function requiredSignature(value, label) {
  if (!/^data:image\/png;base64,[a-z0-9+/]+=*$/i.test(String(value || ''))) {
    throw new Error(`Falta la firma oficial aprobada de ${label}. No se emitirá el nuevo certificado.`)
  }
  const bytes = atob(String(value).split(',')[1])
  const pngHeader = '\x89PNG\r\n\x1a\n'
  const dimension = offset => ((bytes.charCodeAt(offset) << 24) | (bytes.charCodeAt(offset + 1) << 16) | (bytes.charCodeAt(offset + 2) << 8) | bytes.charCodeAt(offset + 3)) >>> 0
  // Reject the 1px placeholder used in visual tests, as well as truncated files.
  // Only an authorized private source can establish that a real rubric is genuine.
  if (!bytes.startsWith(pngHeader) || bytes.length < 500 || dimension(16) < 100 || dimension(20) < 25) {
    throw new Error(`La firma de ${label} no es un recurso oficial válido.`)
  }
  return value
}

export async function buildCertificateV2Pdf(record, options = {}) {
  const institutional = record?.TemplateVersion === CERTIFICATE_ITSAL_VERSION
  if (!institutional && record?.TemplateVersion !== CERTIFICATE_V2_VERSION) throw new Error('Versión de plantilla incorrecta.')
  const certificate = normalizeIssuedCertificate(record)
  const professional = certificate.CertificateSubject === 'professional'
  if (institutional && certificate.CertificateSubject !== 'institutional_aval') throw new Error('El aval ITSAL no corresponde al tipo de certificado.')
  if (institutional && (!/itsal|san\s+luis/i.test(String(certificate.InstitucionAval || ''))
    || !String(certificate.AvalCodigoExterno || '').trim() || certificate.EstadoAval !== 'avalado')) {
    throw new Error('Falta la confirmación y el código de registro ITSAL del aval.')
  }
  if (professional && certificate.ProfessionalRole !== 'capacitador') {
    throw new Error('El rol profesional no tiene una plantilla autorizada.')
  }
  const missing = professional
    ? [
      ['identificador profesional', certificate.ID], ['nombre', certificate.ClienteNombre],
      ['identificación', certificate.ClienteID], ['curso', certificate.ServicioNombre],
      ['duración', certificate.Duracion], ['fecha de inicio', certificate.FechaInicio],
      ['fecha de fin', certificate.FechaFin], ['modalidad', certificate.Modalidad],
    ].filter(([, value]) => !String(value || '').trim()).map(([label]) => label)
    : validateCertificateData(certificate)
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
  const type = professional
    ? { heading: 'DE CAPACITADOR', intro: 'Ha impartido en calidad de capacitador el curso:' }
    : participantCertificateType(certificate.CertificateType)
  const publicId = String(certificate.CertificatePublicId || certificate.ID)
  const verificationUrl = buildVerificationUrl(publicId)
  const [qr, background, logo, mark, seal, regular, bold, italic, itsal] = await Promise.all([
    generateQrDataUrl(publicId),
    ...['background', 'logo', 'mark', 'seal', 'regular', 'bold', 'italic'].map(key => asDataUrl(key, options.assetDataUrls)),
    institutional ? asDataUrl('itsal', options.assetDataUrls) : Promise.resolve(null),
  ])
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [WIDTH, HEIGHT], compress: true })
  pdf.setFileId(deterministicCertificatePdfFileId(`${publicId}|${certificate.CodigoCertificado}|${certificate.CertificateVersion || 1}|${certificate.TemplateVersion}`))
  pdf.setCreationDate(deterministicCertificatePdfCreationDate(certificate.FechaEmisionCertificado))
  addFonts(pdf, { regular, bold, italic })
  pdf.addImage(background, 'PNG', 0, 0, WIDTH, HEIGHT)
  // Keep the identity compact so the corporate name and title have breathing room.
  pdf.addImage(logo, 'PNG', 140, 6.5, 40, 17)
  // The supplied corporate logo includes a tiny slogan absent from the approved
  // certificate reference. Cover only that region, not the orange separator.
  pdf.setFillColor(255, 255, 255)
  pdf.rect(159.8, 20.6, 20.7, 3.2, 'F')
  // Use the exact corporate mark as the security watermark. The previous
  // typographic “R” had a full stem and did not match the registered symbol.
  pdf.saveGraphicsState()
  pdf.setGState(new pdf.GState({ opacity: 0.055 }))
  pdf.addImage(mark, 'PNG', 175, 78, 36, 44.4)
  pdf.restoreGraphicsState()
  pdf.setTextColor(...NAVY)
  line(pdf, 'RESEARCH ASSESSOR TRAINING S.A.S.', 32, 180, 11.5, 10, 'CertificatePlex', 'bold')
  line(pdf, `R.U.C.: ${issuerRuc} · Expediente: ${issuerFile}`, 37, 180, 9.5, 8)
  if (institutional) {
    // The two institutional endorsements belong to opposite corners rather
    // than being crowded together between the signatories.
    pdf.addImage(seal, 'PNG', 22, 15, 26, 20)
    pdf.addImage(itsal, 'PNG', 263, 14, 36, 15)
    pdf.setFont('CertificatePlex', 'bold')
    pdf.setFontSize(8)
    pdf.text('AVAL R.A. TRAINING', 35, 39, { align: 'center' })
    pdf.text('AVAL ITSAL', 281, 35, { align: 'center' })
  }
  // Very pale security squares from the approved composition, kept behind the
  // title and body so that neither the name nor the QR loses contrast.
  pdf.setFillColor(253, 246, 239)
  pdf.rect(212.5, 54.5, 7, 7, 'F')
  pdf.rect(225.5, 54.5, 7, 7, 'F')
  pdf.rect(219, 62.5, 8, 9, 'F')
  pdf.setDrawColor(...ORANGE)
  pdf.setLineWidth(0.35)
  pdf.line(66, 47, 94, 47)
  pdf.line(226, 47, 254, 47)
  pdf.setTextColor(...ORANGE)
  pdf.setFillColor(...ORANGE)
  diamond(pdf, 98, 47, 1.3)
  diamond(pdf, 222, 47, 1.3)
  pdf.setTextColor(...NAVY)
  line(pdf, 'CERTIFICADO', 51, 170, 47, 37, 'times', 'bold')
  pdf.setTextColor(...ORANGE)
  line(pdf, type.heading, 61, 165, 28, 22, 'times', 'bold')
  pdf.setTextColor(...NAVY)
  line(pdf, 'Se certifica que:', 68.5, 180, 11, 9)
  line(pdf, String(certificate.ClienteNombre).trim(), 78.5, 195, 30, 18, 'times', 'italic')
  line(pdf, `${professional ? 'Identificación' : 'Cédula de Identidad'}: ${certificate.ClienteID}`, 84.3, 185, 11, 9)
  line(pdf, type.intro, 91.2, 190, 11, 9)
  line(pdf, String(certificate.ServicioNombre).trim(), 98.8, 195, 20, 12, 'times', 'bold')
  line(pdf, `con una duración de ${normalizeDuration(certificate.Duracion)}, ${professional ? 'impartido' : 'desarrollado'} desde`, 105.3, 190, 10, 8)
  line(pdf, `el ${formatLongDate(certificate.FechaInicio)} hasta el ${formatLongDate(certificate.FechaFin)}, bajo la modalidad`, 110.5, 194, 10, 8)
  line(pdf, `${certificate.Modalidad}.`, 115.7, 185, 10, 8)
  if (institutional) {
    pdf.setDrawColor(...ORANGE)
    pdf.setLineWidth(0.2)
    pdf.line(160, 120, 160, 130)
    pdf.setTextColor(...NAVY)
    fittedText(pdf, 'AVAL R.A. TRAINING', 87, 123.5, 82, 9, 7, 'bold')
    fittedText(pdf, 'AVAL ITSAL', 219, 123.5, 82, 9, 7, 'bold')
    fittedText(pdf, `Registro R.A.: ${certificate.CodigoCertificado}`, 87, 129, 105, 8, 6.5)
    fittedText(pdf, `Registro ITSAL: ${certificate.AvalCodigoExterno}`, 219, 129, 82, 8, 6.5)
  } else {
    line(pdf, 'En constancia de lo anterior, se expide el presente certificado', 122.8, 202, 10, 8)
    line(pdf, 'para los fines que el interesado considere pertinentes.', 128.2, 200, 10, 8)
  }
  line(pdf, `Riobamba, ${formatLongDate(certificate.FechaEmisionCertificado)}`, 134, 185, 10, 8, 'CertificatePlex', 'bold')

  // The director's rubric is naturally taller/less horizontal than the
  // manager's. Give it a taller box ending on the same signature line so both
  // retain their real proportions while carrying comparable visual weight.
  signatureInBox(pdf, directorSignature, 76, 132.8, 49, 17.2)
  signatureInBox(pdf, managerSignature, 195, 136.5, 49, 13.5)
  if (!institutional) {
    pdf.addImage(seal, 'PNG', 143, 135.5, 34, 26)
  }
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
  pdf.roundedRect(261, 106, 49, 59, 3, 3)
  pdf.setFont('CertificatePlex', 'bold')
  pdf.setTextColor(...NAVY)
  pdf.setFontSize(12)
  pdf.text('VERIFICACIÓN', 285.5, 113, { align: 'center' })
  pdf.addImage(qr, 'PNG', 270.5, 116, 30, 30)
  pdf.link(270.5, 116, 30, 30, { url: verificationUrl })
  pdf.setFontSize(8)
  pdf.text(String(certificate.CodigoCertificado), 285.5, 152, { align: 'center' })
  pdf.setFont('CertificatePlex', 'normal')
  pdf.setFontSize(8)
  pdf.text('Verificación en:', 285.5, 158, { align: 'center' })
  pdf.setFont('CertificatePlex', 'bold')
  pdf.text('ra-training.com/verificar', 285.5, 162.5, { align: 'center' })
  if (!institutional) {
    pdf.setFontSize(8)
    pdf.text(`Código único: ${certificate.CodigoCertificado}`, 285, 22, { align: 'right' })
    pdf.setFont('CertificatePlex', 'normal')
    pdf.text('Documento digital con trazabilidad', 285, 26.5, { align: 'right' })
    verifiedRegisterBadge(pdf)
    pdf.setFont('CertificatePlex', 'bold')
    pdf.setFontSize(8)
    pdf.text('Registro digital verificable', 247, 36, { align: 'left' })
  }
  pdf.setFillColor(...NAVY)
  pdf.roundedRect(126, 166, 68, 14, 2, 2, 'F')
  pdf.setDrawColor(255, 255, 255)
  pdf.setLineWidth(0.3)
  pdf.circle(142, 172.6, 2.8)
  pdf.ellipse(142, 172.6, 1.3, 2.8)
  pdf.line(139.2, 172.6, 144.8, 172.6)
  pdf.setTextColor(255, 255, 255)
  pdf.setFontSize(12)
  pdf.setFont('CertificatePlex', 'normal')
  pdf.text('ra-training.com', 168, 174, { align: 'center' })
  pdf.setTextColor(...NAVY)
  fittedText(pdf, `RESEARCH ASSESSOR TRAINING S.A.S. · R.U.C. ${issuerRuc} · EXPEDIENTE ${issuerFile} · DOCUMENTO DIGITAL VERIFICABLE`, 84, 173, 78, 4.5, 2.5)
  fittedText(pdf, `Fecha de emisión: ${formatLongDate(certificate.FechaEmisionCertificado)} · DOCUMENTO DIGITAL VERIFICABLE · RESEARCH ASSESSOR TRAINING S.A.S.`, 252, 173, 118, 5.5, 3)
  pdf.setProperties({ title: `Certificado ${certificate.CodigoCertificado}`, subject: certificate.ServicioNombre, author: 'Research Assessor Training S.A.S.' })
  const safeName = String(certificate.ClienteNombre).replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]+/g, '_')
  return {
    blob: pdf.output('blob'),
    filename: `${institutional ? 'certificado_aval_ITSAL' : 'certificado'}_${safeName}_${certificate.CertificateVersion || 1}.pdf`,
    verificationUrl,
    certificateCode: certificate.CodigoCertificado,
    templateVersion: certificate.TemplateVersion,
  }
}
