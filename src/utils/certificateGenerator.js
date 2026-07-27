import { jsPDF } from 'jspdf'
import { buildVerificationUrl, generateQrDataUrl } from './qr.js'
import { CERTIFICATE_CONFIG as cfg } from './certificateConfig.js'

const PAGE_WIDTH = 381
const PAGE_HEIGHT = 254

// La plantilla es el PNG exportado directamente desde Canva. No se reconstruyen
// sus bordes, logotipo, firmas, sello ni textos institucionales: se conserva la
// imagen completa y únicamente se cubren los campos que deben cambiar.
const certificateAssetUrls = {
  template: new URL('../assets/certificate/canva/certificate-template.png', import.meta.url).href,
  plexRegular: new URL('../assets/certificate/canva/IBMPlexSansCondensed-Regular.ttf', import.meta.url).href,
  plexBold: new URL('../assets/certificate/canva/IBMPlexSansCondensed-Bold.ttf', import.meta.url).href,
  nameItalic: new URL('../assets/certificate/canva/OpenSansCondensed-MediumItalic.ttf', import.meta.url).href,
}

const cachedAssetDataUrls = new Map()
const COLORS = {
  background: [254, 253, 248],
  navy: [5, 42, 90],
}

function isTrue(value) {
  return value === true || String(value || '').toUpperCase() === 'TRUE'
}

function hasExternalEndorsement(inscripcion) {
  return isTrue(inscripcion.RequiereAvalExterno)
}

export function certificateCodeFor(inscripcion) {
  if (inscripcion.CodigoCertificado) return inscripcion.CodigoCertificado
  const year = new Date(inscripcion.FechaEmisionCertificado || Date.now()).getFullYear()
  const compact = String(inscripcion.ID || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(-10)
    .padStart(8, '0')
  return `RA-${year}-${compact}`
}

export function validateCertificateData(inscripcion) {
  const fields = [
    ['ID interno de la inscripción', inscripcion.ID],
    ['participante', inscripcion.ClienteNombre],
    ['identificación', inscripcion.ClienteID],
    ['curso', inscripcion.ServicioNombre],
    ['duración', inscripcion.Duracion],
    ['fecha de inicio', inscripcion.FechaInicio],
    ['fecha de fin', inscripcion.FechaFin],
    ['modalidad', inscripcion.Modalidad],
  ]
  const missing = fields.filter(([, value]) => !String(value || '').trim()).map(([label]) => label)
  if (inscripcion.EstadoPago !== 'verificado') missing.unshift('pago verificado')
  if (hasExternalEndorsement(inscripcion) && inscripcion.EstadoAval !== 'avalado') {
    missing.push('aval institucional completado')
  }
  return missing
}

export function formatLongDate(value) {
  if (!value) return ''
  const source = String(value)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(source)
    ? new Date(`${source}T12:00:00Z`)
    : new Date(source)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function normalizeDuration(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (/^\d+(?:[.,]\d+)?$/.test(text)) return `${text} horas académicas`
  if (/\bhoras?\b/i.test(text)) {
    return text.replace(/\s*horas?(?:\s+acad[eé]micas?)?\s*$/i, ' horas académicas')
  }
  return text
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('No se pudo leer un recurso del certificado.'))
    reader.readAsDataURL(blob)
  })
}

async function loadAssetDataUrl(key) {
  if (cachedAssetDataUrls.has(key)) return cachedAssetDataUrls.get(key)
  const response = await fetch(certificateAssetUrls[key])
  if (!response.ok) throw new Error('No se pudo cargar la plantilla oficial del certificado.')
  const dataUrl = await blobToDataUrl(await response.blob())
  cachedAssetDataUrls.set(key, dataUrl)
  return dataUrl
}

async function loadCertificateAssets(overrides = {}) {
  const entries = await Promise.all(Object.keys(certificateAssetUrls).map(async key => [
    key,
    overrides[key] || await loadAssetDataUrl(key),
  ]))
  return Object.fromEntries(entries)
}

function dataUrlBase64(dataUrl) {
  const separator = String(dataUrl || '').indexOf(',')
  if (separator < 0) throw new Error('Una tipografía del certificado no tiene un formato válido.')
  return String(dataUrl).slice(separator + 1)
}

function registerFonts(doc, assets) {
  doc.addFileToVFS('IBMPlexSansCondensed-Regular.ttf', dataUrlBase64(assets.plexRegular))
  doc.addFont('IBMPlexSansCondensed-Regular.ttf', 'IBMPlexSansCondensed', 'normal')
  doc.addFileToVFS('IBMPlexSansCondensed-Bold.ttf', dataUrlBase64(assets.plexBold))
  doc.addFont('IBMPlexSansCondensed-Bold.ttf', 'IBMPlexSansCondensed', 'bold')
  doc.addFileToVFS('OpenSansCondensed-MediumItalic.ttf', dataUrlBase64(assets.nameItalic))
  doc.addFont('OpenSansCondensed-MediumItalic.ttf', 'OpenSansCondensed', 'italic')
}

function cover(doc, x, y, width, height, color = COLORS.background) {
  doc.setFillColor(...color)
  doc.rect(x, y, width, height, 'F')
}

function fitOneLine(doc, text, { family, style, maxSize, minSize, maxWidth }) {
  doc.setFont(family, style)
  let size = maxSize
  doc.setFontSize(size)
  while (size > minSize && doc.getTextWidth(String(text || '')) > maxWidth) {
    size -= 0.5
    doc.setFontSize(size)
  }
  return size
}

function fitLines(doc, text, { family, style, maxSize, minSize, maxWidth, maxLines }) {
  doc.setFont(family, style)
  let size = maxSize
  doc.setFontSize(size)
  let lines = doc.splitTextToSize(String(text || ''), maxWidth)
  while (size > minSize && lines.length > maxLines) {
    size -= 0.5
    doc.setFontSize(size)
    lines = doc.splitTextToSize(String(text || ''), maxWidth)
  }
  return { size, lines: lines.slice(0, maxLines) }
}

function fitFixedLines(doc, lines, { family, style, maxSize, minSize, maxWidth }) {
  doc.setFont(family, style)
  let size = maxSize
  doc.setFontSize(size)
  while (size > minSize && lines.some(line => doc.getTextWidth(line) > maxWidth)) {
    size -= 0.25
    doc.setFontSize(size)
  }
  return size
}

function drawDynamicFields(doc, inscripcion) {
  const centerX = PAGE_WIDTH / 2
  doc.setTextColor(...COLORS.navy)

  // Nombre: la referencia aprobada ya no incluye la línea decorativa inferior.
  cover(doc, 104, 96.1, 173, 13)
  fitOneLine(doc, inscripcion.ClienteNombre, {
    family: 'OpenSansCondensed',
    style: 'italic',
    maxSize: 35,
    minSize: 18,
    maxWidth: 169,
  })
  doc.text(String(inscripcion.ClienteNombre), centerX, 108.2, { align: 'center' })

  // La etiqueta "Cédula de Identidad" pertenece a Canva; solo cambia el valor.
  cover(doc, 197.8, 109.15, 31.5, 7)
  doc.setFont('IBMPlexSansCondensed', 'bold')
  doc.setFontSize(12.5)
  doc.text(String(inscripcion.ClienteID), 198.55, 115.75)

  // Curso: la referencia aprobada ya no incluye las líneas decorativas laterales.
  cover(doc, 104.3, 131, 172.4, 16.3)
  const course = fitLines(doc, inscripcion.ServicioNombre, {
    family: 'IBMPlexSansCondensed',
    style: 'bold',
    maxSize: 28.4,
    minSize: 15,
    maxWidth: 169.5,
    maxLines: 2,
  })
  const courseY = course.lines.length === 1 ? 142.7 : 136.4
  doc.text(course.lines, centerX, courseY, { align: 'center', lineHeightFactor: 0.92 })

  cover(doc, 112.5, 147.3, 156, 20.1)
  const detailLines = [
    `con una duración de ${normalizeDuration(inscripcion.Duracion)}, desarrollado desde`,
    `el ${formatLongDate(inscripcion.FechaInicio)} hasta el ${formatLongDate(inscripcion.FechaFin)}, bajo la modalidad`,
    `${String(inscripcion.Modalidad).trim()}.`,
  ]
  fitFixedLines(doc, detailLines, {
    family: 'IBMPlexSansCondensed',
    style: 'normal',
    maxSize: 14.9,
    minSize: 11.5,
    maxWidth: 154,
  })
  doc.text(detailLines, centerX, 153.5, { align: 'center', lineHeightFactor: 1.15 })

  cover(doc, 166, 188.5, 60, 8.3)
  const emissionDate = formatLongDate(inscripcion.FechaEmisionCertificado || new Date())
  const dateText = `${cfg.city}, ${emissionDate}`
  fitOneLine(doc, dateText, {
    family: 'IBMPlexSansCondensed',
    style: 'bold',
    maxSize: 11.3,
    minSize: 9,
    maxWidth: 58,
  })
  doc.text(dateText, 194.5, 193.65, { align: 'center' })
}

function drawUniqueVerificationQr(doc, qrDataUrl, verificationUrl) {
  // Se elimina por completo el QR de muestra de Canva y se coloca uno generado
  // para el ID interno de esta inscripción. El resto del recuadro queda intacto.
  cover(doc, 318.4, 176.5, 40.6, 40.6)
  doc.addImage(qrDataUrl, 'PNG', 319.6, 177.6, 38.1, 38.1)
  doc.link(317.2, 162.5, 48.4, 75.5, { url: verificationUrl })
}

export async function buildCertificatePdf(inscripcion, options = {}) {
  const missing = validateCertificateData(inscripcion)
  if (missing.length) {
    throw new Error(`Faltan los siguientes datos para generar el certificado: ${missing.join(', ')}.`)
  }
  if (inscripcion.EstadoCertificado !== 'emitido' || !String(inscripcion.CodigoCertificado || '').trim() || !inscripcion.FechaEmisionCertificado) {
    throw new Error('El certificado oficial debe ser emitido por un administrador antes de generar el PDF.')
  }

  const recordId = String(inscripcion.ID).trim()
  const certificateCode = certificateCodeFor(inscripcion)
  const verificationUrl = buildVerificationUrl(recordId)
  const [qrDataUrl, assets] = await Promise.all([
    generateQrDataUrl(recordId),
    loadCertificateAssets(options.assetDataUrls),
  ])

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [PAGE_WIDTH, PAGE_HEIGHT],
    compress: true,
  })
  registerFonts(doc, assets)
  doc.addImage(assets.template, 'PNG', 0, 0, PAGE_WIDTH, PAGE_HEIGHT, 'canva-template', 'FAST')
  drawDynamicFields(doc, inscripcion)
  drawUniqueVerificationQr(doc, qrDataUrl, verificationUrl)
  doc.setProperties({
    title: `Certificado de ${inscripcion.ClienteNombre}`,
    subject: `Certificado ${certificateCode} - ${inscripcion.ServicioNombre}`,
    author: 'R.A. Training',
    creator: 'Plataforma R.A. Training',
    keywords: `${certificateCode}, certificado, ${recordId}`,
  })

  const safeName = String(inscripcion.ClienteNombre).trim().replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]+/g, '_')
  return {
    blob: doc.output('blob'),
    filename: `certificado_${safeName || recordId}.pdf`,
    qrDataUrl,
    verificationUrl,
    certificateCode,
  }
}
