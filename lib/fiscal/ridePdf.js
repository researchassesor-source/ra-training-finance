import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import { getEmisorConfig } from './emisorConfig.js'

export class RidePdfError extends Error {}

// Paleta oficial de la app (src/config/brand.js + tailwind.config.js: brand-950/900
// y secondary-500) -- el RIDE reutiliza los mismos tonos que el resto del producto en
// vez de aproximar un azul/naranja distinto.
const NAVY = [8, 42, 92] // #082A5C (brand-900)
const NAVY_DARK = [4, 27, 61] // #041B3D (brand-950)
const ORANGE = [241, 135, 26] // #F1871A (secondary-500)
const WHITE = [255, 255, 255]
const TEXT = [23, 30, 43]
const MUTED = [104, 114, 131]
const BORDER = [203, 213, 229]
const BORDER_SOFT = [226, 232, 242]
const CARD_BG = [247, 249, 252]
const RED = [178, 40, 40]
const GRAY_BADGE = [120, 130, 145]

const PAGE = { w: 210, h: 297 }
const MARGIN = 10
const CONTENT_X = MARGIN
const CONTENT_W = PAGE.w - MARGIN * 2
const CONTENT_RIGHT = PAGE.w - MARGIN
const CONTENT_BOTTOM = 278 // deja espacio fijo para la línea de pie de página
const LINE_HEIGHT_FACTOR = 1.15
const PT_TO_MM = 0.352778

const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

// ─────────────────────────────────────────────
// Utilidades de datos (sin inventar campos que el sistema no tenga)
// ─────────────────────────────────────────────

function text(value, fallback = '') {
  const v = value === null || value === undefined ? '' : String(value)
  return v.trim() || fallback
}

function fiscalCents(value) {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'string' && value.includes('.')) return Math.round((Number(value) || 0) * 100)
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n) : 0
}

export function formatMoney(value) {
  return MONEY.format(fiscalCents(value) / 100)
}

export function formatRideDate(value, withTime = false) {
  const raw = text(value)
  if (!raw) return '-'
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return raw
  const parts = new Intl.DateTimeFormat('es-EC', {
    timeZone: 'America/Guayaquil',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(parsed)
  return parts.replace(',', '')
}

export function paymentLabel(factura) {
  return text(factura.PaymentMethodInternal, 'No registrado')
}

export function paymentCodeLabel(factura) {
  return text(factura.SriPaymentCode, '-')
}

export function issuerRucLabel(factura) {
  const raw = text(factura.IssuerRuc)
  return /^\d{1,13}$/.test(raw) ? raw.padStart(13, '0') : raw
}

export function qrPayloadForFactura(factura) {
  return text(factura.AccessKey)
}

/** El sistema solo persiste 5 tipos de identificación de comprador (ver
 * TIPO_IDENTIFICACION_COMPRADOR en facturaXml.js) -- se traduce a una etiqueta legible
 * solo si el valor coincide con uno de esos 5; cualquier otra cosa se oculta en vez de
 * mostrarse cruda o inventada. */
const BUYER_ID_LABELS = {
  ruc: 'RUC',
  cedula: 'Cédula',
  pasaporte: 'Pasaporte',
  consumidorFinal: 'Consumidor final',
  exterior: 'Identificación del exterior',
}

function buyerIdentificationTypeLabel(factura) {
  const raw = text(factura.BuyerIdentificationType)
  return BUYER_ID_LABELS[raw] || ''
}

/** Este sistema factura exclusivamente en USD (money.js/facturaXml.js no soportan
 * otra moneda) -- Currency casi siempre es 'USD' o está vacío; en ambos casos el
 * valor real y verificable es el mismo. */
function currencyLabel(factura) {
  const raw = text(factura.Currency).toUpperCase()
  if (!raw || raw === 'USD' || raw === 'DOLAR' || raw === 'DOLARES') return 'USD - Dólares'
  return raw
}

function statusLabel(factura) {
  const sri = text(factura.SriAuthorizationStatus).toUpperCase()
  if (sri === 'AUTORIZADO') return 'AUTORIZADA'
  if (sri === 'NO_AUTORIZADO') return 'NO AUTORIZADA'
  const status = text(factura.Status).toUpperCase()
  if (['AUTHORIZED', 'DELIVERY_PENDING', 'DELIVERED'].includes(status)) return 'AUTORIZADA'
  return status || 'PENDIENTE'
}

function statusBadgeColor(factura) {
  const label = statusLabel(factura)
  if (label === 'AUTORIZADA') return ORANGE
  if (label === 'NO AUTORIZADA') return RED
  return GRAY_BADGE
}

function environmentLabel(factura) {
  return text(factura.Environment).toLowerCase() === 'production' ? 'Producción' : 'Pruebas'
}

function documentNumber(factura) {
  return text(
    factura.DocumentNumber
    || [factura.Establishment, factura.EmissionPoint, factura.Sequential].filter(Boolean).join('-'),
    '-',
  )
}

/**
 * Datos legales del emisor: RUC y (si existiera) razón social vienen de la factura
 * persistida; nombre comercial y dirección matriz NO se guardan por factura -- salen
 * de emisorConfig.js, la MISMA fuente que ya usa buildXmlParaFactura para el XML real
 * (nunca un valor aproximado solo para el RIDE). obligadoContabilidad es la constante
 * real usada para bloquear/permitir la emisión (ver facturaOrchestrator.js), así que
 * mostrarla no es inventar un dato -- es el mismo valor que ya rige la factura.
 */
function emisorData(factura) {
  const config = getEmisorConfig()
  return {
    razonSocial: text(factura.IssuerName || factura.RazonSocialEmisor, config.razonSocial),
    nombreComercial: config.nombreComercial,
    ruc: issuerRucLabel(factura) || config.ruc,
    dirMatriz: config.dirMatriz,
    obligadoContabilidad: config.obligadoContabilidad,
  }
}

function normalizeItems(factura, items) {
  if (Array.isArray(items) && items.length) return items
  return [{
    Codigo: 'ITEM',
    Descripcion: text(factura.Description, 'Servicio facturado'),
    Cantidad: 1,
    PrecioUnitarioCents: fiscalCents(factura.GrandTotal),
    DescuentoCents: fiscalCents(factura.DiscountCents),
    BaseCents: fiscalCents(factura.SubtotalWithoutTax || factura.GrandTotal),
    TotalCents: fiscalCents(factura.GrandTotal),
    TaxRateBasisPoints: 0,
  }]
}

function totalTaxLabel(items) {
  const rates = [...new Set(items.map(item => Number(item.TaxRateBasisPoints) || 0))]
  if (rates.length === 1) return `IVA ${rates[0] / 100}%`
  return 'IVA'
}

// ─────────────────────────────────────────────
// Medición y wrap de texto -- todo bloque calcula su altura ANTES de asumir una
// posición fija; nada se dibuja con "1 línea" como supuesto implícito.
// ─────────────────────────────────────────────

function lineHeightMM(fontSize) {
  return fontSize * PT_TO_MM * LINE_HEIGHT_FACTOR
}

function setFontFor(doc, { size = 9, style = 'normal', font = 'helvetica' } = {}) {
  doc.setFont(font, style)
  doc.setFontSize(size)
}

/** Envuelve texto a `width` mm con la fuente/tamaño indicados. Nunca corta contenido:
 * si el valor está vacío usa el fallback dado. */
function wrapLines(doc, value, width, opts = {}) {
  setFontFor(doc, opts)
  const raw = text(value, opts.fallback ?? '-')
  return doc.splitTextToSize(raw, Math.max(width, 4))
}

function blockHeight(lines, fontSize) {
  return Math.max(1, lines.length) * lineHeightMM(fontSize)
}

/** Reduce el tamaño de fuente (nunca lo aumenta) hasta que `value` quepa en una sola
 * línea dentro de `maxWidth` -- usado para títulos/valores que NUNCA deben invadir un
 * elemento vecino (p.ej. el badge de estado) ni partirse en varias líneas. */
function fitFontSizeToWidth(doc, value, maxWidth, { startSize, minSize = 7, font = 'helvetica', style = 'bold' } = {}) {
  let size = startSize
  doc.setFont(font, style)
  while (size > minSize) {
    doc.setFontSize(size)
    if (doc.getTextWidth(value) <= maxWidth) return size
    size -= 0.5
  }
  return minSize
}

// ─────────────────────────────────────────────
// Iconografía vectorial simple (sin emojis, sin depender de fuentes Unicode)
// ─────────────────────────────────────────────

function drawMiniIcon(doc, kind, x, y, color = NAVY) {
  doc.setDrawColor(...color)
  doc.setTextColor(...color)
  doc.setLineWidth(0.6)
  if (kind === 'check') {
    doc.circle(x + 4, y + 4, 3.6)
    doc.line(x + 1.9, y + 4.1, x + 3.4, y + 5.6)
    doc.line(x + 3.4, y + 5.6, x + 6.2, y + 2.5)
  } else if (kind === 'doc') {
    doc.rect(x + 1, y, 6, 8)
    doc.line(x + 2.5, y + 3, x + 5.8, y + 3)
    doc.line(x + 2.5, y + 5, x + 5.8, y + 5)
  } else if (kind === 'gear') {
    doc.circle(x + 4, y + 4, 3.2)
    doc.circle(x + 4, y + 4, 1.1)
  } else if (kind === 'building') {
    doc.rect(x + 1, y + 1, 6, 7)
    doc.line(x + 4, y, x + 4, y + 8)
    doc.line(x + 2, y + 3, x + 3, y + 3)
    doc.line(x + 5, y + 3, x + 6, y + 3)
  } else if (kind === 'person') {
    doc.circle(x + 4, y + 2.5, 2)
    doc.line(x, y + 8, x + 2, y + 5.7)
    doc.line(x + 2, y + 5.7, x + 6, y + 5.7)
    doc.line(x + 6, y + 5.7, x + 8, y + 8)
  } else if (kind === 'calendar') {
    doc.rect(x + 1, y + 1, 7, 7)
    doc.line(x + 1, y + 3, x + 8, y + 3)
  } else if (kind === 'bank') {
    doc.line(x + 1, y + 8, x + 8, y + 8)
    doc.line(x + 2, y + 3, x + 7, y + 3)
    doc.line(x + 4.5, y, x + 8, y + 3)
    doc.line(x + 4.5, y, x + 1, y + 3)
    for (let i = 0; i < 3; i += 1) doc.line(x + 2.2 + i * 2, y + 3, x + 2.2 + i * 2, y + 8)
  } else if (kind === 'cash') {
    doc.rect(x, y + 1, 8, 6)
    doc.circle(x + 4, y + 4, 1.6)
  } else if (kind === 'tag') {
    doc.line(x, y + 4, x + 4, y)
    doc.line(x + 4, y, x + 8, y + 4)
    doc.line(x + 8, y + 4, x + 4, y + 8)
    doc.line(x + 4, y + 8, x, y + 4)
    doc.circle(x + 4, y + 4, 0.6)
  }
}

// ─────────────────────────────────────────────
// Logo: usa el asset oficial del proyecto, nunca lo redibuja como texto. Preserva
// proporción real vía getImageProperties (contain-fit, sin deformar).
// ─────────────────────────────────────────────

let cachedLogo // { base64, ratio } | null -- se resuelve una sola vez por proceso

function loadLogo(doc) {
  if (cachedLogo !== undefined) return cachedLogo
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const logoPath = join(here, '..', '..', 'src', 'assets', 'brand', 'logo-ra-training.png')
    if (!existsSync(logoPath)) {
      cachedLogo = null
      return cachedLogo
    }
    const base64 = readFileSync(logoPath).toString('base64')
    const dataUri = `data:image/png;base64,${base64}`
    const props = doc.getImageProperties(dataUri)
    cachedLogo = { dataUri, ratio: props.width / props.height }
  } catch {
    cachedLogo = null
  }
  return cachedLogo
}

function drawLogo(doc, x, y, maxW, maxH) {
  const logo = loadLogo(doc)
  if (!logo) {
    doc.setDrawColor(...WHITE)
    doc.setLineWidth(0.7)
    doc.roundedRect(x, y, maxW, maxH, 2, 2, 'S')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...WHITE)
    doc.text('R.A.', x + maxW / 2, y + maxH / 2 + 1.5, { align: 'center' })
    return
  }
  let w = maxW
  let h = w / logo.ratio
  if (h > maxH) {
    h = maxH
    w = h * logo.ratio
  }
  const offsetX = x + (maxW - w) / 2
  const offsetY = y + (maxH - h) / 2
  doc.addImage(logo.dataUri, 'PNG', offsetX, offsetY, w, h, undefined, 'FAST')
}

// ─────────────────────────────────────────────
// Paginación: ningún bloque asume que cabe -- cada uno pide el espacio que
// realmente necesita antes de dibujarse.
// ─────────────────────────────────────────────

function drawContinuationHeader(doc, factura) {
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, PAGE.w, 16, 'F')
  doc.setFillColor(...ORANGE)
  doc.rect(0, 16, PAGE.w, 0.8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(...WHITE)
  doc.text('R.A. Training Finance · FACTURA ELECTRÓNICA', CONTENT_X, 10)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text(`Comprobante ${documentNumber(factura)} · continuación`, CONTENT_RIGHT, 10, { align: 'right' })
  return 24
}

function ensureSpace(doc, y, needed, factura) {
  if (y + needed <= CONTENT_BOTTOM) return y
  doc.addPage()
  return drawContinuationHeader(doc, factura)
}

// ─────────────────────────────────────────────
// Header principal (solo página 1)
// ─────────────────────────────────────────────

const HEADER_H = 32

/**
 * Hero de portada -- tres zonas horizontales explícitas, siempre en este orden y sin
 * solapamiento posible entre ellas: [LOGO] | [TÍTULO] | [BADGE DE ESTADO]. El ancho
 * disponible del título se calcula ANTES de dibujarlo, a partir del borde real del
 * badge (`badgeLeft`), y el título SIEMPRE se ajusta (nunca la posición del badge) --
 * ver fitFontSizeToWidth. Esto es estructural, no cosmético: hace geométricamente
 * imposible que un título largo invada el badge, sin importar cuánto mida el texto.
 */
function drawMainHeader(doc, factura) {
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, PAGE.w, HEADER_H, 'F')
  doc.setFillColor(...NAVY_DARK)
  doc.rect(0, 0, PAGE.w, 4, 'F')
  doc.setFillColor(...ORANGE)
  doc.rect(0, HEADER_H, PAGE.w, 1.2, 'F')

  // Zona 1: LOGO.
  const logoX = CONTENT_X
  const logoW = 20
  drawLogo(doc, logoX, 6, logoW, 20)
  const logoRight = logoX + logoW

  // Zona 3: BADGE (se calcula antes que el título -- ver docstring).
  const badgeColor = statusBadgeColor(factura)
  const badgeW = 40
  const badgeLeft = CONTENT_RIGHT - badgeW
  const safeGap = 6

  // Zona 2: TÍTULO -- ocupa exactamente el espacio entre el logo y el badge.
  const titleX = logoRight + 6
  const titleMaxWidth = badgeLeft - titleX - safeGap

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...WHITE)
  doc.text('R.A. Training', titleX, 12)
  doc.setTextColor(...ORANGE)
  doc.text('Finance', titleX, 18)

  doc.setDrawColor(190, 203, 222)
  doc.setLineWidth(0.25)
  doc.line(titleX + 40, 7, titleX + 40, 25)
  const brandBlockWidth = 46 // ancho reservado a "R.A. Training / Finance" + separador
  const titleX2 = titleX + brandBlockWidth
  const title2MaxWidth = badgeLeft - titleX2 - safeGap

  doc.setTextColor(...WHITE)
  const titleSize = fitFontSizeToWidth(doc, 'FACTURA ELECTRÓNICA', title2MaxWidth, { startSize: 16, minSize: 10, style: 'bold' })
  doc.setFontSize(titleSize)
  doc.text('FACTURA ELECTRÓNICA', titleX2, 15)
  doc.setFont('helvetica', 'normal')
  const subtitleSize = fitFontSizeToWidth(doc, 'Comprobante Electrónico · RIDE', title2MaxWidth, { startSize: 8.6, minSize: 6.5, style: 'normal' })
  doc.setFontSize(subtitleSize)
  doc.setTextColor(210, 220, 235)
  doc.text('Comprobante Electrónico · RIDE', titleX2, 21.5)

  doc.setFillColor(255, 255, 255)
  doc.roundedRect(badgeLeft, 6, badgeW, 7, 1.3, 1.3, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.6)
  doc.setTextColor(...NAVY)
  doc.text('RIDE', badgeLeft + badgeW / 2, 11, { align: 'center' })
  doc.setFillColor(...badgeColor)
  doc.roundedRect(badgeLeft, 14, badgeW, 7, 1.3, 1.3, 'F')
  doc.setTextColor(...WHITE)
  doc.setFontSize(7.2)
  const statusLines = doc.splitTextToSize(statusLabel(factura), badgeW - 4)
  doc.text(statusLines, badgeLeft + badgeW / 2, statusLines.length > 1 ? 17.5 : 19, { align: 'center' })
}

// ─────────────────────────────────────────────
// Resumen (No. documento / Ambiente / Estado / Fecha emisión)
// ─────────────────────────────────────────────

function drawSummaryItem(doc, kind, label, value, x, y, w) {
  drawMiniIcon(doc, kind, x, y + 3)
  setFontFor(doc, { size: 8, style: 'normal' })
  doc.setTextColor(...MUTED)
  doc.text(label, x + 12, y + 6)
  setFontFor(doc, { size: 9.5, style: 'bold' })
  doc.setTextColor(...TEXT)
  doc.text(doc.splitTextToSize(text(value, '-'), w - 8), x + 12, y + 13)
}

function drawSummary(doc, factura, y) {
  const h = 18
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.setFillColor(...CARD_BG)
  doc.roundedRect(CONTENT_X, y, CONTENT_W, h, 1.5, 1.5, 'FD')
  const colW = CONTENT_W / 4
  for (let i = 1; i < 4; i += 1) {
    doc.setDrawColor(...BORDER_SOFT)
    doc.line(CONTENT_X + colW * i, y + 4, CONTENT_X + colW * i, y + h - 4)
  }
  drawSummaryItem(doc, 'doc', 'No. documento', documentNumber(factura), CONTENT_X + 5, y + 1, colW - 6)
  drawSummaryItem(doc, 'gear', 'Ambiente', environmentLabel(factura), CONTENT_X + colW + 5, y + 1, colW - 6)
  drawSummaryItem(doc, 'check', 'Estado', statusLabel(factura), CONTENT_X + colW * 2 + 5, y + 1, colW - 6)
  drawSummaryItem(doc, 'calendar', 'Fecha de emisión', formatRideDate(factura.IssueDate || factura.CreatedAt), CONTENT_X + colW * 3 + 5, y + 1, colW - 6)
  return y + h + 5
}

// ─────────────────────────────────────────────
// Tarjetas EMISOR / CLIENTE -- altura dinámica, simétrica entre ambas
// ─────────────────────────────────────────────

const CARD_TITLE_H = 8
const CARD_ICON_TOP = 9
const CARD_ROW_LABEL_SIZE = 7
const CARD_ROW_VALUE_SIZE = 8.6
const CARD_ROW_GAP = 2.2
const CARD_LABEL_VALUE_OFFSET = 3.3 // separación vertical label -> valor dentro de la MISMA fila
const CARD_TOP_PAD = 5
const CARD_BOTTOM_PAD = 4
const CARD_TEXT_X_OFFSET = 22
const CARD_MIN_HEIGHT = 30

/** Altura real que consume una fila (label + valor), usada tanto para medir como para
 * dibujar -- si estas dos rutas usaran fórmulas distintas, la tarjeta podría recortar
 * su propio contenido o sobrar espacio vacío sin motivo. */
function cardRowConsumedHeight(row) {
  return CARD_LABEL_VALUE_OFFSET + row.height
}

function measureCardRows(doc, rows, w) {
  const usableW = w - (CARD_TEXT_X_OFFSET + 5)
  return rows
    .filter(row => text(row.value))
    .map(row => {
      const lines = wrapLines(doc, row.value, usableW, { size: CARD_ROW_VALUE_SIZE, style: 'bold' })
      return { ...row, lines, height: blockHeight(lines, CARD_ROW_VALUE_SIZE) }
    })
}

function measureCardHeight(doc, rows, w) {
  const measured = measureCardRows(doc, rows, w)
  const rowsHeight = measured.reduce((sum, row) => sum + cardRowConsumedHeight(row) + CARD_ROW_GAP, 0)
  return Math.max(CARD_TOP_PAD + CARD_ICON_TOP + rowsHeight + CARD_BOTTOM_PAD, CARD_MIN_HEIGHT)
}

function drawSectionTitle(doc, title, x, y, w) {
  doc.setFillColor(...NAVY)
  doc.rect(x, y, w, CARD_TITLE_H, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.6)
  doc.setTextColor(...WHITE)
  doc.text(title, x + 4, y + 5.6)
}

function drawCard(doc, { title, icon, rows }, x, y, w, forcedHeight) {
  const measured = measureCardRows(doc, rows, w)
  const h = forcedHeight || measureCardHeight(doc, rows, w)
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.roundedRect(x, y, w, h, 1.5, 1.5, 'S')
  drawSectionTitle(doc, title, x, y, w)

  doc.setFillColor(...NAVY)
  doc.circle(x + 10.5, y + CARD_TITLE_H + CARD_ICON_TOP / 2 + 1, 6, 'F')
  drawMiniIcon(doc, icon, x + 6.5, y + CARD_TITLE_H + CARD_ICON_TOP / 2 - 3, WHITE)

  let rowY = y + CARD_TITLE_H + CARD_ICON_TOP + CARD_TOP_PAD - 3
  measured.forEach((row, index) => {
    setFontFor(doc, { size: CARD_ROW_LABEL_SIZE, style: 'normal' })
    doc.setTextColor(...MUTED)
    doc.text(row.label, x + CARD_TEXT_X_OFFSET, rowY)
    setFontFor(doc, { size: CARD_ROW_VALUE_SIZE, style: 'bold' })
    doc.setTextColor(...TEXT)
    doc.text(row.lines, x + CARD_TEXT_X_OFFSET, rowY + CARD_LABEL_VALUE_OFFSET)
    const consumed = cardRowConsumedHeight(row)
    if (index < measured.length - 1) {
      doc.setDrawColor(...BORDER_SOFT)
      doc.setLineDashPattern([1, 1], 0)
      doc.line(x + CARD_TEXT_X_OFFSET, rowY + consumed + 1, x + w - 5, rowY + consumed + 1)
      doc.setLineDashPattern([], 0)
    }
    rowY += consumed + CARD_ROW_GAP
  })
}

function drawTwinCards(doc, cardA, cardB, y) {
  const gap = 5
  const w = (CONTENT_W - gap) / 2
  const h = Math.max(measureCardHeight(doc, cardA.rows, w), measureCardHeight(doc, cardB.rows, w))
  const needed = h + 5
  y = ensureSpace(doc, y, needed, cardA.__factura)
  drawCard(doc, cardA, CONTENT_X, y, w, h)
  drawCard(doc, cardB, CONTENT_X + w + gap, y, w, h)
  return y + h + 5
}

// ─────────────────────────────────────────────
// Grilla de información de emisión / comprobante -- hasta 4 columnas, filas
// dinámicas según la cantidad de campos realmente disponibles.
// ─────────────────────────────────────────────

/** Forma de pago y su código SRI se combinan en un solo campo -- son dos facetas del
 * mismo dato, y separarlos dejaba una 2ª fila del grid casi vacía con un único campo
 * huérfano ("Tipo de emisión" solo). Con 4 campos el grid de 4 columnas siempre
 * ocupa exactamente una fila completa, sin importar qué campos opcionales falten. */
function buildInfoFields(factura) {
  const pago = paymentLabel(factura)
  const codigo = paymentCodeLabel(factura)
  const pagoValue = codigo && codigo !== '-' ? `${pago} · SRI ${codigo}` : pago
  const fields = [
    { icon: 'calendar', label: 'Fecha de emisión', value: formatRideDate(factura.IssueDate || factura.CreatedAt) },
    { icon: 'doc', label: 'Forma de pago', value: pagoValue },
    { icon: 'cash', label: 'Moneda', value: currencyLabel(factura) },
    { icon: 'check', label: 'Tipo de emisión', value: 'Normal' },
  ]
  return fields.filter(f => text(f.value))
}

function drawInfoGrid(doc, factura, y) {
  const fields = buildInfoFields(factura)
  if (!fields.length) return y
  const cols = 4
  const colW = CONTENT_W / cols
  const cellUsableW = colW - 15
  const rows = []
  for (let i = 0; i < fields.length; i += cols) rows.push(fields.slice(i, i + cols))

  const measuredRows = rows.map(row => row.map(field => {
    const lines = wrapLines(doc, field.value, cellUsableW, { size: 8.8, style: 'bold' })
    return { ...field, lines, height: blockHeight(lines, 8.8) }
  }))
  const rowHeights = measuredRows.map(row => Math.max(13, ...row.map(f => f.height + 6.5)))
  const totalHeight = rowHeights.reduce((a, b) => a + b, 0)

  y = ensureSpace(doc, y, totalHeight + 5, factura)
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.roundedRect(CONTENT_X, y, CONTENT_W, totalHeight, 1.5, 1.5, 'S')

  let rowY = y
  measuredRows.forEach((row, rowIndex) => {
    const rh = rowHeights[rowIndex]
    row.forEach((field, colIndex) => {
      const cellX = CONTENT_X + colW * colIndex
      drawMiniIcon(doc, field.icon, cellX + 5, rowY + 4)
      setFontFor(doc, { size: 7.2, style: 'normal' })
      doc.setTextColor(...MUTED)
      doc.text(doc.splitTextToSize(field.label, cellUsableW), cellX + 15, rowY + 6)
      setFontFor(doc, { size: 8.8, style: 'bold' })
      doc.setTextColor(...TEXT)
      doc.text(field.lines, cellX + 15, rowY + 10.8)
      if (colIndex < cols - 1 && colIndex < row.length - 1) {
        doc.setDrawColor(...BORDER_SOFT)
        doc.line(cellX + colW, rowY + 2.5, cellX + colW, rowY + rh - 2.5)
      }
    })
    if (rowIndex < measuredRows.length - 1) {
      doc.setDrawColor(...BORDER_SOFT)
      doc.line(CONTENT_X, rowY + rh, CONTENT_RIGHT, rowY + rh)
    }
    rowY += rh
  })
  return y + totalHeight + 5
}

// ─────────────────────────────────────────────
// Tabla de detalle -- columnas fijas, Descripción es la más ancha, cada fila
// calcula su altura a partir del texto real (incluida la columna Código).
// ─────────────────────────────────────────────

const TABLE_COLS = {
  codigo: { x: CONTENT_X, w: 30 },
  descripcion: { x: CONTENT_X + 30, w: 80 },
  cantidad: { x: CONTENT_X + 110, w: 12 },
  precio: { x: CONTENT_X + 122, w: 24 },
  descuento: { x: CONTENT_X + 146, w: 18 },
  base: { x: CONTENT_X + 164, w: 26 },
}

/**
 * Códigos internos/fiscales (CAPACITACION_RA, CAPACITACION_CERTIFICADO, ...) NUNCA se
 * parten a mitad de palabra -- primero se reduce el tamaño de fuente hasta un mínimo
 * legible para mantenerlos en una sola línea; solo si ni así caben, se envuelve
 * exclusivamente en los separadores naturales del propio código (_, -, /).
 */
function splitCodeAtNaturalSeparators(value) {
  const parts = String(value).split(/(?<=[_\-/])/)
  return parts.length ? parts : [String(value)]
}

function wrapCodeValue(doc, value, maxWidth, { startSize = 7.6, minSize = 6, font = 'helvetica', style = 'bold' } = {}) {
  const raw = text(value, '-')
  const fitSize = fitFontSizeToWidth(doc, raw, maxWidth, { startSize, minSize, font, style })
  doc.setFont(font, style)
  doc.setFontSize(fitSize)
  if (doc.getTextWidth(raw) <= maxWidth) return { lines: [raw], size: fitSize }

  const segments = splitCodeAtNaturalSeparators(raw)
  const lines = []
  let current = ''
  for (const seg of segments) {
    const candidate = current + seg
    if (current && doc.getTextWidth(candidate) > maxWidth) {
      lines.push(current)
      current = seg
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return { lines: lines.length ? lines : [raw], size: minSize }
}

function drawTableHeader(doc, y) {
  doc.setFillColor(...NAVY)
  doc.rect(CONTENT_X, y, CONTENT_W, 9, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.6)
  doc.setTextColor(...WHITE)
  doc.text('CÓDIGO', TABLE_COLS.codigo.x + 2, y + 6)
  doc.text('DESCRIPCIÓN', TABLE_COLS.descripcion.x + 2, y + 6)
  doc.text('CANT.', TABLE_COLS.cantidad.x + TABLE_COLS.cantidad.w / 2, y + 6, { align: 'center' })
  doc.text('P. UNITARIO', TABLE_COLS.precio.x + TABLE_COLS.precio.w / 2, y + 6, { align: 'center' })
  doc.text('DESCUENTO', TABLE_COLS.descuento.x + TABLE_COLS.descuento.w / 2, y + 6, { align: 'center' })
  doc.text('SUBTOTAL', TABLE_COLS.base.x + TABLE_COLS.base.w - 2, y + 6, { align: 'right' })
  return y + 9
}

function renderDetailTable(doc, factura, items, startY) {
  let y = ensureSpace(doc, startY, 9, factura)
  y = drawTableHeader(doc, y)

  const safeItems = normalizeItems(factura, items)
  let zebra = false
  safeItems.forEach((item, index) => {
    const codigo = wrapCodeValue(doc, item.Codigo, TABLE_COLS.codigo.w - 4)
    const descLines = wrapLines(doc, item.Descripcion, TABLE_COLS.descripcion.w - 4, { size: 8.4, style: 'normal' })
    const rowH = Math.max(9.5, blockHeight(descLines, 8.4) + 4, blockHeight(codigo.lines, codigo.size) + 4)

    if (y + rowH > CONTENT_BOTTOM) {
      doc.addPage()
      y = drawContinuationHeader(doc, factura)
      y = drawTableHeader(doc, y)
    }

    if (zebra) {
      doc.setFillColor(...CARD_BG)
      doc.rect(CONTENT_X, y, CONTENT_W, rowH, 'F')
    }
    zebra = !zebra

    doc.setDrawColor(...BORDER_SOFT)
    doc.setLineWidth(0.25)
    doc.rect(CONTENT_X, y, CONTENT_W, rowH)
    ;[TABLE_COLS.descripcion.x, TABLE_COLS.cantidad.x, TABLE_COLS.precio.x, TABLE_COLS.descuento.x, TABLE_COLS.base.x].forEach(x => {
      doc.line(x, y, x, y + rowH)
    })

    const midY = y + rowH / 2 + 1.4
    setFontFor(doc, { size: codigo.size, style: 'bold' })
    doc.setTextColor(...NAVY)
    doc.text(codigo.lines, TABLE_COLS.codigo.x + 2, y + 5)

    setFontFor(doc, { size: 8.4, style: 'normal' })
    doc.setTextColor(...TEXT)
    doc.text(descLines, TABLE_COLS.descripcion.x + 2, y + 5)

    setFontFor(doc, { size: 8.4, style: 'normal' })
    doc.text(text(item.Cantidad, '1'), TABLE_COLS.cantidad.x + TABLE_COLS.cantidad.w / 2, midY, { align: 'center' })
    doc.text(formatMoney(item.PrecioUnitarioCents), TABLE_COLS.precio.x + TABLE_COLS.precio.w / 2, midY, { align: 'center' })
    doc.text(formatMoney(item.DescuentoCents), TABLE_COLS.descuento.x + TABLE_COLS.descuento.w / 2, midY, { align: 'center' })
    doc.text(formatMoney(item.BaseCents ?? item.TotalCents), TABLE_COLS.base.x + TABLE_COLS.base.w - 2, midY, { align: 'right' })

    y += rowH
    if (index === safeItems.length - 1) y += 4
  })
  return y
}

// ─────────────────────────────────────────────
// Totales -- solo se listan las filas que la factura realmente usa.
// ─────────────────────────────────────────────

function buildTotalsRows(factura, items) {
  const rows = []
  const discount = fiscalCents(factura.DiscountCents)
  const subtotal0 = fiscalCents(factura.Subtotal0)
  const subtotalTaxed = fiscalCents(factura.SubtotalTaxed)
  const taxTotal = fiscalCents(factura.TaxTotal)
  const hasTaxed = subtotalTaxed > 0 || taxTotal > 0

  if (subtotal0 > 0 || (!hasTaxed && fiscalCents(factura.SubtotalWithoutTax) > 0)) {
    rows.push(['Subtotal 0%', formatMoney(subtotal0 || factura.SubtotalWithoutTax)])
  }
  if (hasTaxed) {
    rows.push(['Subtotal gravado', formatMoney(subtotalTaxed)])
    rows.push([totalTaxLabel(items), formatMoney(taxTotal)])
  }
  if (discount > 0) {
    rows.push(['Descuento', `-${formatMoney(discount)}`])
  }
  if (!rows.length) {
    rows.push(['Subtotal', formatMoney(factura.SubtotalWithoutTax || factura.GrandTotal)])
  }
  return rows
}

function drawTotals(doc, factura, items, y) {
  const rows = buildTotalsRows(factura, items)
  const rowH = 7
  const rowsH = rows.length * rowH
  const h = rowsH + 9
  y = ensureSpace(doc, y, h + 5, factura)
  const w = 94
  const x = CONTENT_RIGHT - w
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.roundedRect(x, y, w, h, 1.5, 1.5, 'S')
  rows.forEach((row, index) => {
    setFontFor(doc, { size: 9, style: 'bold' })
    doc.setTextColor(...TEXT)
    doc.text(row[0], x + 4, y + 6 + index * rowH)
    doc.text(row[1], x + w - 4, y + 6 + index * rowH, { align: 'right' })
    if (index < rows.length - 1) {
      doc.setDrawColor(...BORDER_SOFT)
      doc.setLineDashPattern([1, 1], 0)
      doc.line(x, y + 8.5 + index * rowH, x + w, y + 8.5 + index * rowH)
      doc.setLineDashPattern([], 0)
    }
  })
  const totalBarY = y + rowsH + 2
  const barH = 8
  doc.setFillColor(...NAVY)
  doc.rect(x, totalBarY, w, barH, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...WHITE)
  doc.text('TOTAL A PAGAR', x + 4, totalBarY + 5.6)
  doc.text(formatMoney(factura.GrandTotal), x + w - 4, totalBarY + 5.6, { align: 'right' })
  return totalBarY + barH + 5
}

// ─────────────────────────────────────────────
// QR -- siempre cuadrado (proporción 1:1), sin deformar.
// ─────────────────────────────────────────────

function drawQr(doc, payload, x, y, size) {
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'M', margin: 0 })
  const count = qr.modules.size
  const cell = size / count
  doc.setFillColor(255, 255, 255)
  doc.rect(x, y, size, size, 'F')
  doc.setFillColor(0, 0, 0)
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.modules.get(row, col)) doc.rect(x + col * cell, y + row * cell, cell + 0.02, cell + 0.02, 'F')
    }
  }
}

/** Ajusta el tamaño de fuente monoespaciada para que las 49 posiciones de la clave
 * de acceso quepan en una sola línea dentro del ancho disponible -- nunca se corta
 * ni se parte en varias líneas salvo que ni el tamaño mínimo razonable quepa. */
function fitAccessKeyFontSize(doc, value, maxWidth) {
  return fitFontSizeToWidth(doc, value, maxWidth, { startSize: 12, minSize: 7, font: 'courier', style: 'bold' })
}

function drawAuthorization(doc, factura, y) {
  const legend = 'Verifique su validez escaneando el código QR o ingresando la clave de acceso en el portal del SRI: www.sri.gob.ec.'
  const lastMessage = text(factura.LastSriMessage)

  const rightColW = 62
  const legendLines = wrapLines(doc, legend, rightColW, { size: 7.6, style: 'normal' })
  const infoRows = [
    { icon: 'check', label: 'Estado de autorización', value: statusLabel(factura) },
    { icon: 'calendar', label: 'Fecha y hora de autorización', value: formatRideDate(factura.AuthorizationDate, true) },
    { icon: 'bank', label: 'Entidad autorizadora', value: text(factura.AuthorizationEntity, 'SERVICIO DE RENTAS INTERNAS') },
  ]
  if (lastMessage) infoRows.push({ icon: 'doc', label: 'Último mensaje SRI', value: lastMessage })

  // QR nunca por debajo de 26mm (proporción 1:1) -- reducirlo más allá comprometería
  // la legibilidad del escaneo, así que el resto del bloque se compacta a su alrededor.
  const qrSize = 26
  const infoColW = 62
  const infoLabelValueOffset = 3.9 // separación label -> valor DENTRO de la misma fila
  const infoRowGap = 2.6
  const measuredInfo = infoRows.map(row => {
    const lines = wrapLines(doc, row.value, infoColW, { size: 8.2, style: 'bold' })
    return { ...row, lines, height: blockHeight(lines, 8.2) }
  })
  // El consumo real de cada fila incluye el offset label->valor -- ignorarlo (como en
  // una versión anterior) subestima la altura y hace que la fila siguiente empiece
  // encima del valor de la fila anterior.
  const infoRowConsumed = row => infoLabelValueOffset + row.height
  const infoHeight = measuredInfo.reduce((sum, row) => sum + infoRowConsumed(row) + infoRowGap, 0)
  const topBlock = 24 // título + label clave + caja de clave + gap al cuerpo
  const bodyHeight = Math.max(qrSize, infoHeight, blockHeight(legendLines, 7.6))
  const h = topBlock + bodyHeight + 5

  y = ensureSpace(doc, y, h + 5, factura)
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.roundedRect(CONTENT_X, y, CONTENT_W, h, 1.5, 1.5, 'S')
  drawSectionTitle(doc, 'AUTORIZACIÓN / VALIDACIÓN SRI', CONTENT_X, y, CONTENT_W)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.8)
  doc.setTextColor(...MUTED)
  doc.text('CLAVE DE ACCESO / AUTORIZACIÓN', CONTENT_X + 4, y + 12.5)
  doc.setDrawColor(...BORDER)
  doc.roundedRect(CONTENT_X + 4, y + 14.5, CONTENT_W - 8, 7, 1, 1)
  const accessKey = text(factura.AccessKey, '-')
  const akFontSize = fitAccessKeyFontSize(doc, accessKey, CONTENT_W - 16)
  doc.setTextColor(...NAVY)
  doc.text(accessKey, PAGE.w / 2, y + 19.2, { align: 'center' })

  const bodyY = y + topBlock
  drawQr(doc, qrPayloadForFactura(factura), CONTENT_X + 6, bodyY, qrSize)

  doc.setDrawColor(...BORDER_SOFT)
  doc.setLineDashPattern([1, 1], 0)
  const divider1X = CONTENT_X + 6 + qrSize + 6
  const divider2X = divider1X + infoColW + 14
  doc.line(divider1X, bodyY, divider1X, bodyY + bodyHeight)
  doc.line(divider2X, bodyY, divider2X, bodyY + bodyHeight)
  doc.setLineDashPattern([], 0)

  let rowY = bodyY + 3.4
  const infoX = divider1X + 8
  measuredInfo.forEach(row => {
    drawMiniIcon(doc, row.icon, infoX, rowY - 3, NAVY)
    setFontFor(doc, { size: 7.2, style: 'normal' })
    doc.setTextColor(...MUTED)
    doc.text(row.label, infoX + 11, rowY)
    setFontFor(doc, { size: 8.2, style: 'bold' })
    doc.setTextColor(...TEXT)
    doc.text(row.lines, infoX + 11, rowY + infoLabelValueOffset)
    rowY += infoRowConsumed(row) + infoRowGap
  })

  setFontFor(doc, { size: 7.6, style: 'normal' })
  doc.setTextColor(...MUTED)
  doc.text(legendLines, divider2X + 6, bodyY + 3.4)

  return y + h + 5
}

function drawFooter(doc) {
  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    doc.setDrawColor(...NAVY)
    doc.setLineWidth(0.5)
    doc.line(CONTENT_X, 284, CONTENT_RIGHT, 284)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...NAVY)
    doc.text('Representación impresa del comprobante electrónico.', PAGE.w / 2, 290, { align: 'center' })
    if (pageCount > 1) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(...MUTED)
      doc.text(`Página ${page} de ${pageCount}`, CONTENT_RIGHT, 290, { align: 'right' })
    }
  }
}

// ─────────────────────────────────────────────
// Punto de entrada
// ─────────────────────────────────────────────

/**
 * `onDocCreated` es un hook opcional exclusivamente para QA/tests (ver
 * ridePdf.visualAudit.test.js): permite instrumentar el `doc` de jsPDF recién creado
 * (por ejemplo, para registrar geometría real de cada shape dibujado y detectar
 * overlaps/desbordes) sin alterar en nada la salida real del PDF ni el contrato
 * público de dos argumentos que usa el resto del sistema.
 */
export function buildRidePdfBytes(factura, items = [], { onDocCreated } = {}) {
  if (!factura || typeof factura !== 'object') throw new RidePdfError('Se requiere la factura autorizada para generar el RIDE.')
  if (factura.SriAuthorizationStatus !== 'AUTORIZADO' && factura.Status !== 'DELIVERY_PENDING' && factura.Status !== 'DELIVERED') {
    throw new RidePdfError('Solo se puede generar RIDE para una factura autorizada.')
  }
  if (!factura.AuthorizationNumber) throw new RidePdfError('La factura autorizada no tiene numero de autorizacion.')
  if (!qrPayloadForFactura(factura)) throw new RidePdfError('La factura autorizada no tiene clave de acceso para el QR.')

  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  if (typeof onDocCreated === 'function') onDocCreated(doc)
  doc.setProperties({
    title: `RIDE ${documentNumber(factura)}`,
    subject: 'Representacion impresa de documento electronico',
    creator: 'R.A. Training Finance',
  })

  const emisor = emisorData(factura)
  const cliente = {
    razonSocial: text(factura.BuyerName),
    identificacion: text(factura.BuyerIdentification),
    tipoIdentificacion: buyerIdentificationTypeLabel(factura),
    email: text(factura.BuyerEmail),
    direccion: text(factura.BuyerAddress),
  }

  drawMainHeader(doc, factura)
  let y = drawSummary(doc, factura, HEADER_H + 6)

  const emisorRows = [
    { label: 'Razón social / emisor', value: emisor.razonSocial },
    { label: 'Nombre comercial', value: emisor.nombreComercial },
    // RUC + obligación de contabilidad combinados en una sola fila -- ambos son
    // valores cortos, separarlos en dos filas solo agregaba altura sin aportar
    // legibilidad.
    { label: 'RUC · Obligado a llevar contabilidad', value: `${emisor.ruc}  ·  ${emisor.obligadoContabilidad ? 'SÍ' : 'NO'}` },
    { label: 'Dirección matriz', value: emisor.dirMatriz },
  ]
  const clienteRows = [
    { label: 'Cliente / razón social', value: cliente.razonSocial },
    { label: cliente.tipoIdentificacion ? `Identificación (${cliente.tipoIdentificacion})` : 'Identificación', value: cliente.identificacion },
    { label: 'Correo electrónico', value: cliente.email },
    { label: 'Dirección', value: cliente.direccion },
  ]

  y = drawTwinCards(
    doc,
    { title: 'EMISOR', icon: 'building', rows: emisorRows, __factura: factura },
    { title: 'CLIENTE', icon: 'person', rows: clienteRows, __factura: factura },
    y,
  )

  y = drawInfoGrid(doc, factura, y)

  const safeItems = normalizeItems(factura, items)
  y = renderDetailTable(doc, factura, safeItems, y)
  y = drawTotals(doc, factura, safeItems, y)
  drawAuthorization(doc, factura, y)
  drawFooter(doc)

  return new Uint8Array(doc.output('arraybuffer'))
}

export function sha256Hex(bytes) {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}
