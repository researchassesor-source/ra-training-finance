import { jsPDF } from 'jspdf'
import { buildVerificationUrl, generateQrDataUrl } from './qr.js'
import { participantCertificateType } from '../config/certificateTypes.js'
import { fitInstitutionalLogoForPdf } from './pdfImageOptimization.js'
import {
  deterministicCertificatePdfCreationDate,
  deterministicCertificatePdfFileId,
  formatLongDate,
  normalizeDuration,
  normalizeIssuedCertificate,
  validateCertificateData,
} from './certificateGenerator.js'

export const CERTIFICATE_V2_VERSION = 'ra-security-2026-v2'
export const CERTIFICATE_V3_VERSION = 'ra-security-2026-v3'
export const CERTIFICATE_ITSAL_VERSION = 'ra-itsal-security-2026-v1'
export const CERTIFICATE_INSTITUTIONAL_AVAL_TEMPLATE = 'ra-institutional-aval-2026'
export const CERTIFICATE_INSTITUTIONAL_AVAL_V2_TEMPLATE = 'ra-institutional-aval-2026-v2'
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
  goldSeal: new URL('../assets/certificate/ra-gold-seal-v5.png', import.meta.url).href,
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
  const format = String(dataUrl).startsWith('data:image/jpeg') ? 'JPEG' : 'PNG'
  pdf.addImage(dataUrl, format, x + (width - drawnWidth) / 2, y + (height - drawnHeight) / 2, drawnWidth, drawnHeight)
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

function requiredInstitutionalImage(value, label) {
  const match = String(value || '').match(/^data:image\/(png|jpeg);base64,([a-z0-9+/]+=*)$/i)
  if (!match) throw new Error(`Falta la imagen oficial de ${label} o su formato no es válido.`)
  const bytes = atob(match[2])
  const validPng = match[1].toLowerCase() === 'png' && bytes.startsWith('\x89PNG\r\n\x1a\n')
  const validJpeg = match[1].toLowerCase() === 'jpeg' && bytes.charCodeAt(0) === 255 && bytes.charCodeAt(1) === 216 && bytes.charCodeAt(2) === 255
  if (!validPng && !validJpeg) throw new Error(`La imagen oficial de ${label} está dañada.`)
  return value
}

function institutionImageInBox(pdf, dataUrl, x, y, width, height) {
  const image = pdf.getImageProperties(dataUrl)
  const scale = Math.min(width / image.width, height / image.height)
  const drawnWidth = image.width * scale
  const drawnHeight = image.height * scale
  const format = String(dataUrl).startsWith('data:image/jpeg') ? 'JPEG' : 'PNG'
  pdf.addImage(dataUrl, format, x + (width - drawnWidth) / 2, y + (height - drawnHeight) / 2,
    drawnWidth, drawnHeight, undefined, 'FAST')
}

function drawApprovedGoldSeal(pdf, goldSeal) {
  // Extracted from the approved v5 design, so the lettering and scalloped edge
  // are identical in every newly issued certificate.
  pdf.addImage(goldSeal, 'PNG', 149.2, 141.4, 21.6, 21.6)
}

function drawApprovedFooter(pdf, certificate, issuerRuc, issuerFile) {
  pdf.setTextColor(...NAVY)
  fittedText(pdf, `RESEARCH ASSESSOR TRAINING S.A.S. · R.U.C. ${issuerRuc} · EXPEDIENTE ${issuerFile} · DOCUMENTO DIGITAL VERIFICABLE`,
    83, 173, 78, 4.5, 2.5)
  fittedText(pdf, `Fecha de emisión: ${formatLongDate(certificate.FechaEmisionCertificado)} · DOCUMENTO DIGITAL VERIFICABLE · RESEARCH ASSESSOR TRAINING S.A.S.`,
    252, 173, 118, 5.5, 3)
  pdf.setFillColor(...NAVY)
  pdf.setDrawColor(...ORANGE)
  pdf.setLineWidth(0.3)
  pdf.roundedRect(128, 173, 64, 7, 1.5, 1.5, 'FD')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('CertificatePlex', 'bold')
  pdf.setFontSize(11)
  pdf.text('ra-training.com', 160, 178, { align: 'center' })
}

export function institutionalAvalQrReferenceLayout(certificate) {
  return {
    text: `Código de aval: ${String(certificate?.AvalReferencia || '').trim()}`,
    x: 285.5, y: 155.3, width: 43, height: 7, fontSize: 7, minFontSize: 5.4, style: 'bold',
  }
}

function renderApprovedInstitutionalAval(pdf, data) {
  const { certificate, institution, manager, qr, verificationUrl, background, logo, mark,
    goldSeal, institutionLogo, authoritySignature, managerSignature, issuerRuc, issuerFile, type } = data
  if (!institutionLogo) throw new Error('La nueva plantilla requiere el logotipo institucional oficial y verificable.')
  if (!String(institution.resolutionCode || '').trim()) {
    throw new Error('Registre el código de resolución en la ficha institucional antes de emitir con la nueva plantilla.')
  }
  pdf.addImage(background, 'PNG', 0, 0, WIDTH, HEIGHT)
  pdf.addImage(logo, 'PNG', 25, 7.5, 39, 16.8)
  pdf.saveGraphicsState()
  pdf.setGState(new pdf.GState({ opacity: 0.05 }))
  pdf.addImage(mark, 'PNG', 173, 78, 38, 45)
  pdf.restoreGraphicsState()
  institutionImageInBox(pdf, institutionLogo, 259, 9, 37, 17)
  pdf.setTextColor(...NAVY)
  fittedText(pdf, `R.U.C.: ${issuerRuc}`, 44.5, 28.1, 43, 7.7, 6.2, 'bold')
  fittedText(pdf, 'Resolución de creación', 277.5, 28.1, 45, 7.4, 5.6, 'bold')
  fittedText(pdf, String(institution.resolutionCode).trim(), 277.5, 32.1, 47, 7.4, 5.4, 'bold')

  pdf.setDrawColor(...ORANGE)
  pdf.setFillColor(...ORANGE)
  pdf.setLineWidth(0.3)
  pdf.line(66, 47, 94, 47)
  pdf.line(226, 47, 254, 47)
  diamond(pdf, 98, 47, 1.25)
  diamond(pdf, 222, 47, 1.25)
  pdf.setTextColor(...NAVY)
  line(pdf, 'CERTIFICADO', 51, 170, 47, 37, 'times', 'bold')
  pdf.setTextColor(...ORANGE)
  line(pdf, type.heading, 61, 165, 28, 22, 'times', 'bold')
  pdf.setTextColor(...NAVY)
  line(pdf, 'Se certifica que:', 68.5, 180, 11, 9)
  line(pdf, String(certificate.ClienteNombre).trim(), 78.5, 195, 30, 18, 'times', 'italic')
  line(pdf, `Identificación: ${certificate.ClienteID}`, 84.3, 185, 11, 9)
  line(pdf, type.intro, 91.2, 190, 11, 9)
  line(pdf, String(certificate.ServicioNombre).trim(), 98.8, 195, 20, 12, 'times', 'bold')
  line(pdf, `con una duración de ${normalizeDuration(certificate.Duracion)}, desarrollado desde`, 105.3, 190, 10, 8)
  line(pdf, `el ${formatLongDate(certificate.FechaInicio)} hasta el ${formatLongDate(certificate.FechaFin)}, bajo la modalidad`, 110.5, 194, 10, 8)
  line(pdf, `${certificate.Modalidad}.`, 115.7, 185, 10, 8)
  fittedText(pdf, `Aval institucional: ${institution.legalName || institution.name}${institution.siglas ? ` (${institution.siglas})` : ''}`,
    160, 123, 205, 8.5, 6.5, 'bold')
  fittedText(pdf, `Convenio: ${institution.agreementObject || institution.name}${institution.agreementSignedAt ? ` · firmado ${formatLongDate(institution.agreementSignedAt)}` : ''}`,
    160, 132, 205, 7.5, 5.8)
  line(pdf, `Riobamba, ${formatLongDate(certificate.FechaEmisionCertificado)}`, 138, 185, 9, 7)

  signatureInBox(pdf, managerSignature, 75, 139, 47, 11)
  signatureInBox(pdf, authoritySignature, 195, 139, 47, 11)
  pdf.setDrawColor(...NAVY)
  pdf.setLineWidth(0.25)
  pdf.line(74, 150, 128, 150)
  pdf.line(192, 150, 246, 150)
  pdf.setTextColor(...NAVY)
  fittedText(pdf, manager.name.trim(), 101, 155, 58, 10, 6, 'bold')
  fittedText(pdf, institution.authorityName, 219, 155, 58, 10, 6, 'bold')
  pdf.setTextColor(...ORANGE)
  fittedText(pdf, manager.title.trim(), 101, 160, 58, 8.5, 5.5)
  fittedText(pdf, institution.authorityRole, 219, 160, 58, 8.5, 5.5)
  drawApprovedGoldSeal(pdf, goldSeal)

  pdf.setDrawColor(...ORANGE)
  pdf.setLineWidth(0.4)
  pdf.roundedRect(261, 106, 49, 59, 3, 3)
  pdf.setTextColor(...NAVY)
  pdf.setFont('CertificatePlex', 'bold')
  pdf.setFontSize(12)
  pdf.text('VERIFICACIÓN', 285.5, 113, { align: 'center' })
  pdf.addImage(qr, 'PNG', 270.5, 116, 30, 30)
  pdf.link(270.5, 116, 30, 30, { url: verificationUrl })
  fittedText(pdf, certificate.CodigoCertificado, 285.5, 151.5, 43, 8, 6.5, 'bold')
  const avalReference = institutionalAvalQrReferenceLayout(certificate)
  fittedText(pdf, avalReference.text, avalReference.x, avalReference.y, avalReference.width,
    avalReference.height, avalReference.minFontSize, avalReference.style)
  fittedText(pdf, 'Documento digital con trazabilidad', 285.5, 159, 43, 5.9, 4.4)
  fittedText(pdf, 'ra-training.com/verificar', 285.5, 162.4, 43, 6, 4.5)

  drawApprovedFooter(pdf, certificate, issuerRuc, issuerFile)
}

function renderApprovedRaCertificate(pdf, data) {
  const { certificate, professional, qr, verificationUrl, background, logo, mark, goldSeal,
    directorSignature, managerSignature, issuerRuc, issuerFile, type } = data
  pdf.addImage(background, 'PNG', 0, 0, WIDTH, HEIGHT)
  pdf.addImage(logo, 'PNG', 25, 7.5, 39, 16.8)
  pdf.saveGraphicsState()
  pdf.setGState(new pdf.GState({ opacity: 0.05 }))
  pdf.addImage(mark, 'PNG', 173, 78, 38, 45)
  pdf.restoreGraphicsState()
  pdf.setTextColor(...NAVY)
  fittedText(pdf, `R.U.C.: ${issuerRuc}`, 44.5, 28.1, 43, 7.7, 6.2, 'bold')
  fittedText(pdf, 'Código único', 277.5, 20, 50, 8, 6.4, 'bold')
  fittedText(pdf, certificate.CodigoCertificado, 277.5, 25, 53, 8, 5.8, 'bold')
  fittedText(pdf, 'Documento digital con trazabilidad', 277.5, 29.2, 53, 6.5, 5)

  pdf.setDrawColor(...ORANGE)
  pdf.setFillColor(...ORANGE)
  pdf.setLineWidth(0.3)
  pdf.line(66, 47, 94, 47)
  pdf.line(226, 47, 254, 47)
  diamond(pdf, 98, 47, 1.25)
  diamond(pdf, 222, 47, 1.25)
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
  line(pdf, 'En constancia de lo anterior, se expide el presente certificado', 122.8, 202, 10, 8)
  line(pdf, 'para los fines que el interesado considere pertinentes.', 128.2, 200, 10, 8)
  line(pdf, `Riobamba, ${formatLongDate(certificate.FechaEmisionCertificado)}`, 138, 185, 9, 7)

  signatureInBox(pdf, directorSignature, 75, 136, 47, 14)
  signatureInBox(pdf, managerSignature, 195, 139, 47, 11)
  pdf.setDrawColor(...NAVY)
  pdf.setLineWidth(0.25)
  pdf.line(74, 150, 128, 150)
  pdf.line(192, 150, 246, 150)
  pdf.setTextColor(...NAVY)
  fittedText(pdf, 'Mgs. Edison Bonifaz A.', 101, 155, 58, 10, 6, 'bold')
  fittedText(pdf, 'Mgs. Alexandra Villagómez', 219, 155, 58, 10, 6, 'bold')
  pdf.setTextColor(...ORANGE)
  fittedText(pdf, 'Director Académico', 101, 160, 58, 8.5, 5.5)
  fittedText(pdf, 'Gerente General', 219, 160, 58, 8.5, 5.5)
  drawApprovedGoldSeal(pdf, goldSeal)

  pdf.setDrawColor(...ORANGE)
  pdf.setLineWidth(0.4)
  pdf.roundedRect(261, 106, 49, 59, 3, 3)
  pdf.setTextColor(...NAVY)
  pdf.setFont('CertificatePlex', 'bold')
  pdf.setFontSize(12)
  pdf.text('VERIFICACIÓN', 285.5, 113, { align: 'center' })
  pdf.addImage(qr, 'PNG', 270.5, 116, 30, 30)
  pdf.link(270.5, 116, 30, 30, { url: verificationUrl })
  fittedText(pdf, certificate.CodigoCertificado, 285.5, 151.5, 43, 8, 6.5, 'bold')
  fittedText(pdf, 'Documento digital con trazabilidad', 285.5, 158.5, 43, 5.9, 4.4)
  fittedText(pdf, 'ra-training.com/verificar', 285.5, 162.4, 43, 6, 4.5)
  drawApprovedFooter(pdf, certificate, issuerRuc, issuerFile)
}

async function buildInstitutionalAvalPdf(record, options) {
  const certificate = normalizeIssuedCertificate(record)
  if (certificate.CertificateSubject !== 'institutional_aval' || certificate.EstadoAval !== 'avalado'
    || !String(certificate.AvalCodigoExterno || '').trim()) {
    throw new Error('El certificado necesita un aval confirmado y su código institucional registrado.')
  }
  if (certificate.TemplateVersion === CERTIFICATE_INSTITUTIONAL_AVAL_V2_TEMPLATE
    && !String(certificate.AvalReferencia || '').trim()) {
    throw new Error('Falta la referencia de aval institucional que debe aparecer debajo del QR.')
  }
  const institution = record?.InstitutionData
  if (!institution?.institutionId || !institution?.agreementId || !String(institution?.name || '').trim()
    || !String(institution?.authorityId || '').trim() || !String(institution?.authorityName || '').trim()
    || !String(institution?.authorityRole || '').trim()) {
    throw new Error('La emisión no tiene el snapshot completo de institución, convenio y autoridad firmante.')
  }
  const manager = options.signers?.manager || {}
  if (!String(manager.name || '').trim() || !String(manager.title || '').trim()) {
    throw new Error('Configure el nombre y cargo oficiales del gerente firmante antes de emitir.')
  }
  const missing = validateCertificateData(certificate)
  if (missing.length) throw new Error(`Faltan datos del certificado: ${missing.join(', ')}.`)
  const status = String(certificate.CertificateStatus || certificate.EstadoCertificado || '').toLowerCase()
  if (status !== 'emitido' || !certificate.CodigoCertificado || !certificate.FechaEmisionCertificado) {
    throw new Error('El certificado debe estar emitido oficialmente antes de generar el PDF.')
  }
  const externalAssets = options.institutionAssets || {}
  const authoritySignature = requiredInstitutionalImage(externalAssets.authoritySignature, 'la autoridad institucional')
  const institutionLogo = externalAssets.logo ? requiredInstitutionalImage(externalAssets.logo, 'el logotipo institucional') : ''
  const institutionSeal = externalAssets.seal ? requiredInstitutionalImage(externalAssets.seal, 'el sello institucional') : ''
  const managerSignature = requiredSignature(options.signatures?.manager, 'Gerencia General')
  const issuerRuc = String(options.issuerRuc ?? CERTIFICATE_V2_ISSUER.ruc).trim()
  const issuerFile = String(options.issuerFile ?? CERTIFICATE_V2_ISSUER.expediente).trim()
  if (!/^\d{13}$/.test(issuerRuc) || !/^\d{4,12}$/.test(issuerFile)) throw new Error('Falta confirmar el RUC y expediente oficiales del emisor.')

  const type = participantCertificateType(certificate.CertificateType)
  const publicId = String(certificate.CertificatePublicId || certificate.ID)
  const verificationUrl = buildVerificationUrl(publicId)
  const modernAval = certificate.TemplateVersion === CERTIFICATE_INSTITUTIONAL_AVAL_V2_TEMPLATE
  const [qr, background, logo, mark, seal, regular, bold, italic, goldSeal] = await Promise.all([
    generateQrDataUrl(publicId),
    ...['background', 'logo', 'mark', 'seal', 'regular', 'bold', 'italic'].map(key => asDataUrl(key, options.assetDataUrls)),
    modernAval ? asDataUrl('goldSeal', options.assetDataUrls) : Promise.resolve(null),
  ])
  const pdfInstitutionLogo = modernAval ? await fitInstitutionalLogoForPdf(institutionLogo) : institutionLogo
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [WIDTH, HEIGHT], compress: true })
  pdf.setFileId(deterministicCertificatePdfFileId(`${publicId}|${certificate.CodigoCertificado}|${certificate.TemplateVersion}`))
  pdf.setCreationDate(deterministicCertificatePdfCreationDate(certificate.FechaEmisionCertificado))
  addFonts(pdf, { regular, bold, italic })
  if (modernAval) {
    renderApprovedInstitutionalAval(pdf, { certificate, institution, manager, qr, verificationUrl,
      background, logo, mark, goldSeal, institutionLogo: pdfInstitutionLogo, authoritySignature, managerSignature, issuerRuc, issuerFile, type })
    pdf.setProperties({ title: `Certificado avalado ${certificate.CodigoCertificado}`, subject: certificate.ServicioNombre, author: 'Research Assessor Training S.A.S.' })
    const safeName = String(certificate.ClienteNombre).replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]+/g, '_')
    const safeInstitution = String(institution.siglas || institution.name).replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]+/g, '_')
    return { blob: pdf.output('blob'), filename: `certificado_aval_${safeInstitution}_${safeName}.pdf`,
      verificationUrl, certificateCode: certificate.CodigoCertificado, templateVersion: certificate.TemplateVersion }
  }
  pdf.addImage(background, 'PNG', 0, 0, WIDTH, HEIGHT)
  pdf.addImage(logo, 'PNG', 140, 6.5, 40, 17)
  pdf.setFillColor(255, 255, 255)
  pdf.rect(159.8, 20.6, 20.7, 3.2, 'F')
  pdf.saveGraphicsState()
  pdf.setGState(new pdf.GState({ opacity: 0.055 }))
  pdf.addImage(mark, 'PNG', 175, 78, 36, 44.4)
  pdf.restoreGraphicsState()

  if (institutionLogo) {
    institutionImageInBox(pdf, institutionLogo, 265, 12, 34, 20)
  }
  pdf.setTextColor(...NAVY)
  line(pdf, 'RESEARCH ASSESSOR TRAINING S.A.S.', 32, 180, 11.5, 10, 'CertificatePlex', 'bold')
  line(pdf, `R.U.C.: ${issuerRuc} · Expediente: ${issuerFile}`, 37, 180, 9.5, 8)
  if (institutionLogo) {
    pdf.setFont('CertificatePlex', 'bold')
    pdf.setFontSize(7.5)
    pdf.text(String(institution.siglas || institution.name).slice(0, 52), 282, 36, { align: 'center' })
  }
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
  line(pdf, `Identificación: ${certificate.ClienteID}`, 84.3, 185, 11, 9)
  line(pdf, type.intro, 91.2, 190, 11, 9)
  line(pdf, String(certificate.ServicioNombre).trim(), 98.8, 195, 20, 12, 'times', 'bold')
  line(pdf, `con una duración de ${normalizeDuration(certificate.Duracion)}, desarrollado desde`, 105.3, 190, 10, 8)
  line(pdf, `el ${formatLongDate(certificate.FechaInicio)} hasta el ${formatLongDate(certificate.FechaFin)}, bajo la modalidad`, 110.5, 194, 10, 8)
  line(pdf, `${certificate.Modalidad}.`, 115.7, 185, 10, 8)
  pdf.setTextColor(...NAVY)
  fittedText(pdf, `Aval institucional: ${institution.legalName || institution.name}${institution.siglas ? ` (${institution.siglas})` : ''}`, 160, 123, 232, 8.5, 6.5, 'bold')
  fittedText(pdf, `Código de aval: ${certificate.AvalCodigoExterno}`, 160, 127.5, 232, 8, 6.2)
  const agreementText = `Convenio: ${institution.agreementObject || institution.siglas || institution.name}${institution.agreementSignedAt ? ` · firmado ${formatLongDate(institution.agreementSignedAt)}` : ''}`
  fittedText(pdf, agreementText, 160, 132, 232, 7.5, 5.8)
  // La resolución se conserva como respaldo privado de la ficha institucional.
  // No es parte del aval ni debe competir con la fecha y las rúbricas impresas.
  line(pdf, `Riobamba, ${formatLongDate(certificate.FechaEmisionCertificado)}`, 138, 185, 9, 7)

  signatureInBox(pdf, managerSignature, 76, 139, 49, 11)
  signatureInBox(pdf, authoritySignature, 195, 139, 49, 11)
  institutionImageInBox(pdf, institutionSeal || seal, 143, 137, 34, 20)
  pdf.setDrawColor(...NAVY)
  pdf.setLineWidth(0.25)
  pdf.line(74, 150, 128, 150)
  pdf.line(192, 150, 246, 150)
  pdf.setFont('CertificatePlex', 'bold')
  pdf.setTextColor(...NAVY)
  fittedText(pdf, manager.name.trim(), 101, 155, 58, 10, 6, 'bold')
  fittedText(pdf, institution.authorityName, 219, 155, 58, 10, 6, 'bold')
  pdf.setFont('CertificatePlex', 'normal')
  pdf.setTextColor(...ORANGE)
  fittedText(pdf, manager.title.trim(), 101, 160, 58, 8.5, 5.5)
  fittedText(pdf, institution.authorityRole, 219, 160, 58, 8.5, 5.5)

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
  pdf.setFontSize(8)
  pdf.text(`Código único: ${certificate.CodigoCertificado}`, 22, 24, { align: 'left' })
  pdf.setFont('CertificatePlex', 'normal')
  pdf.text('Documento digital con trazabilidad', 22, 28.5, { align: 'left' })
  // En esta variante la esquina derecha pertenece al logotipo y nombre de la
  // institución avalista. El distintivo genérico chocaba con «ITSAL».
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
  pdf.setProperties({ title: `Certificado avalado ${certificate.CodigoCertificado}`, subject: certificate.ServicioNombre, author: 'Research Assessor Training S.A.S.' })
  const safeName = String(certificate.ClienteNombre).replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]+/g, '_')
  const safeInstitution = String(institution.siglas || institution.name).replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]+/g, '_')
  return { blob: pdf.output('blob'), filename: `certificado_aval_${safeInstitution}_${safeName}.pdf`,
    verificationUrl, certificateCode: certificate.CodigoCertificado, templateVersion: certificate.TemplateVersion }
}

export async function buildCertificateV2Pdf(record, options = {}) {
  if ([CERTIFICATE_INSTITUTIONAL_AVAL_TEMPLATE, CERTIFICATE_INSTITUTIONAL_AVAL_V2_TEMPLATE].includes(record?.TemplateVersion)) {
    return buildInstitutionalAvalPdf(record, options)
  }
  const institutional = record?.TemplateVersion === CERTIFICATE_ITSAL_VERSION
  if (!institutional && ![CERTIFICATE_V2_VERSION, CERTIFICATE_V3_VERSION].includes(record?.TemplateVersion)) throw new Error('Versión de plantilla incorrecta.')
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
  // A professional reissue is prepared first, then its PDF is archived and only
  // then does the backend mark it as issued. The prepared timestamp is fixed
  // before rendering so retries produce the identical PDF and hash.
  const preparedProfessionalReissue = professional && status === 'pendiente_pdf'
    && Number(certificate.CertificateVersion) > 1
    && String(certificate.ReplacesCertificateId || '').trim()
    && String(certificate.CertificatePreparedAt || '').trim()
    && !certificate.PdfHash && !certificate.PdfStorageReference
  if (preparedProfessionalReissue) certificate.FechaEmisionCertificado = certificate.CertificatePreparedAt
  if (!(['emitido', 'enviado', 'reemitido'].includes(status) || preparedProfessionalReissue)
    || !certificate.CodigoCertificado || !certificate.FechaEmisionCertificado) {
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
  const approvedLayout = certificate.TemplateVersion === CERTIFICATE_V3_VERSION
  const publicId = String(certificate.CertificatePublicId || certificate.ID)
  const verificationUrl = buildVerificationUrl(publicId)
  const [qr, background, logo, mark, seal, regular, bold, italic, itsal, goldSeal] = await Promise.all([
    generateQrDataUrl(publicId),
    ...['background', 'logo', 'mark', 'seal', 'regular', 'bold', 'italic'].map(key => asDataUrl(key, options.assetDataUrls)),
    institutional ? asDataUrl('itsal', options.assetDataUrls) : Promise.resolve(null),
    approvedLayout ? asDataUrl('goldSeal', options.assetDataUrls) : Promise.resolve(null),
  ])
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [WIDTH, HEIGHT], compress: true })
  pdf.setFileId(deterministicCertificatePdfFileId(`${publicId}|${certificate.CodigoCertificado}|${certificate.CertificateVersion || 1}|${certificate.TemplateVersion}`))
  pdf.setCreationDate(deterministicCertificatePdfCreationDate(certificate.FechaEmisionCertificado))
  addFonts(pdf, { regular, bold, italic })
  if (approvedLayout) {
    renderApprovedRaCertificate(pdf, { certificate, professional, qr, verificationUrl, background, logo,
      mark, goldSeal, directorSignature, managerSignature, issuerRuc, issuerFile, type })
    pdf.setProperties({ title: `Certificado ${certificate.CodigoCertificado}`, subject: certificate.ServicioNombre, author: 'Research Assessor Training S.A.S.' })
    const safeName = String(certificate.ClienteNombre).replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]+/g, '_')
    return { blob: pdf.output('blob'), filename: `certificado_${safeName}_${certificate.CertificateVersion || 1}.pdf`,
      verificationUrl, certificateCode: certificate.CodigoCertificado, templateVersion: certificate.TemplateVersion }
  }
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
