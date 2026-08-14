import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'

export class RidePdfError extends Error {}

const NAVY = [3, 35, 77]
const NAVY_2 = [7, 54, 111]
const ORANGE = [241, 135, 26]
const BORDER = [8, 47, 95]
const LIGHT_BORDER = [205, 214, 226]
const MUTED = [86, 96, 112]
const TEXT = [11, 18, 32]
const PAGE = { w: 210, h: 297, margin: 8 }
const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

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

function statusLabel(factura) {
  const sri = text(factura.SriAuthorizationStatus).toUpperCase()
  if (sri === 'AUTORIZADO') return 'AUTORIZADA'
  if (sri === 'NO_AUTORIZADO') return 'NO AUTORIZADA'
  const status = text(factura.Status).toUpperCase()
  if (['AUTHORIZED', 'DELIVERY_PENDING', 'DELIVERED'].includes(status)) return 'AUTORIZADA'
  return status || 'PENDIENTE'
}

function environmentLabel(factura) {
  return text(factura.Environment).toLowerCase() === 'production' ? 'Produccion' : 'Pruebas'
}

function documentNumber(factura) {
  return text(
    factura.DocumentNumber
    || [factura.Establishment, factura.EmissionPoint, factura.Sequential].filter(Boolean).join('-'),
    '-',
  )
}

function issuerName(factura) {
  return text(factura.IssuerName || factura.RazonSocialEmisor || factura.EmisorRazonSocial, 'RESEARCH ASSESSOR TRAINING S.A.S.')
}

function split(doc, value, width) {
  return doc.splitTextToSize(text(value, '-'), width)
}

function setText(doc, color = TEXT) {
  doc.setTextColor(...color)
}

function roundedRect(doc, x, y, w, h, style = 'S', radius = 1.5) {
  doc.roundedRect(x, y, w, h, radius, radius, style)
}

function drawLogo(doc) {
  const here = dirname(fileURLToPath(import.meta.url))
  const logoPath = join(here, '..', '..', 'src', 'assets', 'brand', 'logo-ra-training.png')
  if (existsSync(logoPath)) {
    try {
      const base64 = readFileSync(logoPath).toString('base64')
      doc.addImage(`data:image/png;base64,${base64}`, 'PNG', 12, 12, 20, 20, undefined, 'FAST')
      return
    } catch {
      // Fall back to the vector mark below.
    }
  }
  doc.setDrawColor(255, 255, 255)
  doc.setLineWidth(0.7)
  doc.roundedRect(12, 12, 20, 20, 2, 2, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text('R.A.', 16, 24)
}

function drawHeader(doc) {
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, PAGE.w, 38, 'F')
  doc.setFillColor(...ORANGE)
  doc.rect(0, 38, PAGE.w, 1.2, 'F')
  drawLogo(doc)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(255, 255, 255)
  doc.text('R.A. Training', 36, 18)
  doc.setTextColor(...ORANGE)
  doc.text('Finance', 36, 29)
  doc.setDrawColor(190, 203, 222)
  doc.setLineWidth(0.25)
  doc.line(94, 11, 94, 31)
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(22)
  doc.text('FACTURA ELECTRONICA', 104, 25)
}

function drawMiniIcon(doc, kind, x, y, color = NAVY) {
  doc.setDrawColor(...color)
  doc.setTextColor(...color)
  doc.setLineWidth(0.7)
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
  } else if (kind === 'bars') {
    for (let i = 0; i < 5; i += 1) doc.rect(x + i * 1.3, y, 0.65, 8, 'F')
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
  }
}

function drawSummaryItem(doc, kind, label, value, x, y, w) {
  drawMiniIcon(doc, kind, x, y + 3)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setText(doc, TEXT)
  doc.text(label, x + 12, y + 6)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.8)
  doc.text(split(doc, value, w - 8), x + 12, y + 13)
}

function drawSummary(doc, factura) {
  const y = 47
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  roundedRect(doc, 8, y, 194, 20)
  const cols = [8, 50, 106, 154, 202]
  for (let i = 1; i < cols.length - 1; i += 1) {
    doc.setDrawColor(...LIGHT_BORDER)
    doc.line(cols[i], y + 4, cols[i], y + 16)
  }
  drawSummaryItem(doc, 'check', 'RIDE', statusLabel(factura), 13, y + 2, 42)
  drawSummaryItem(doc, 'doc', 'No. documento', documentNumber(factura), 57, y + 2, 52)
  drawSummaryItem(doc, 'gear', 'Ambiente', environmentLabel(factura), 112, y + 2, 40)
  drawSummaryItem(doc, 'bars', 'Estado SRI', statusLabel(factura), 159, y + 2, 43)
}

function drawSectionTitle(doc, title, x, y, w) {
  doc.setFillColor(...NAVY)
  doc.roundedRect(x, y, w, 9, 1.5, 1.5, 'F')
  doc.rect(x, y + 4.5, w, 4.5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text(title, x + 4, y + 6.2)
}

function drawInfoCard(doc, { title, icon, rows }, x, y, w, h) {
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  roundedRect(doc, x, y, w, h)
  drawSectionTitle(doc, title, x, y, w)
  doc.setFillColor(...NAVY)
  doc.circle(x + 12, y + 22, 7.8, 'F')
  doc.setDrawColor(255, 255, 255)
  doc.setTextColor(255, 255, 255)
  drawMiniIcon(doc, icon, x + 8, y + 18, [255, 255, 255])
  let rowY = y + 18
  rows.filter(row => text(row.value)).forEach((row, index) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    setText(doc, TEXT)
    doc.text(row.label, x + 25, rowY)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    const lines = split(doc, row.value, w - 34)
    doc.text(lines, x + 25, rowY + 5)
    if (index < rows.length - 1) {
      doc.setDrawColor(170, 176, 186)
      doc.setLineDashPattern([1, 1], 0)
      const dividerY = rowY + 6 + (lines.length * 4.2)
      doc.line(x + 25, dividerY, x + w - 6, dividerY)
      doc.setLineDashPattern([], 0)
    }
    rowY += Math.max(14, lines.length * 4.2 + 9)
  })
}

function drawEmissionInfo(doc, factura) {
  const x = 8
  const y = 118
  const w = 194
  doc.setDrawColor(...BORDER)
  roundedRect(doc, x, y, w, 22)
  const parts = [
    { icon: 'calendar', label: 'Fecha emision', value: formatRideDate(factura.IssueDate || factura.CreatedAt) },
    { icon: 'doc', label: 'Forma de pago', value: paymentLabel(factura) },
    { icon: 'bank', label: 'Codigo SRI forma de pago', value: paymentCodeLabel(factura) },
  ]
  const widths = [54, 54, 58]
  let cursor = x + 8
  parts.forEach((part, index) => {
    drawMiniIcon(doc, part.icon, cursor, y + 7)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    setText(doc, TEXT)
    doc.text(split(doc, part.label, widths[index] - 13), cursor + 12, y + 8)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(split(doc, part.value, widths[index] - 13), cursor + 12, y + 15)
    cursor += widths[index]
    if (index < parts.length - 1) {
      doc.setDrawColor(...LIGHT_BORDER)
      doc.line(cursor, y + 4, cursor, y + 18)
    }
    cursor += 8
  })
}

function tableHeaders(doc, y) {
  doc.setFillColor(...NAVY)
  doc.roundedRect(8, y, 194, 9, 1.5, 1.5, 'F')
  doc.rect(8, y + 4.5, 194, 4.5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(255, 255, 255)
  doc.text('DESCRIPCION', 34, y + 6)
  doc.text('CANTIDAD', 88, y + 6, { align: 'center' })
  doc.text('PRECIO UNITARIO', 119, y + 6, { align: 'center' })
  doc.text('DESCUENTO', 150, y + 6, { align: 'center' })
  doc.text('SUBTOTAL', 187, y + 6, { align: 'right' })
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

function addDetailTable(doc, factura, items) {
  let y = 148
  tableHeaders(doc, y)
  y += 9
  const safeItems = normalizeItems(factura, items)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  safeItems.forEach((item, index) => {
    const desc = split(doc, item.Descripcion, 66)
    const rowH = Math.max(20, desc.length * 4.5 + 8)
    if (y + rowH > 246) {
      doc.addPage()
      drawHeader(doc)
      y = 48
      tableHeaders(doc, y)
      y += 9
    }
    doc.setDrawColor(...LIGHT_BORDER)
    doc.rect(8, y, 194, rowH)
    ;[78, 100, 136, 166].forEach(x => doc.line(x, y, x, y + rowH))
    setText(doc, TEXT)
    doc.text(desc, 12, y + 8)
    doc.text(text(item.Cantidad, '1'), 88, y + rowH / 2 + 1.5, { align: 'center' })
    doc.text(formatMoney(item.PrecioUnitarioCents), 119, y + rowH / 2 + 1.5, { align: 'center' })
    doc.text(formatMoney(item.DescuentoCents), 150, y + rowH / 2 + 1.5, { align: 'center' })
    doc.text(formatMoney(item.BaseCents || item.TotalCents), 192, y + rowH / 2 + 1.5, { align: 'right' })
    y += rowH
    if (index === safeItems.length - 1) y += 6
  })
  return y
}

function totalTaxLabel(items) {
  const rates = [...new Set(normalizeItems({}, items).map(item => Number(item.TaxRateBasisPoints) || 0))]
  if (rates.length === 1) return `IVA ${rates[0] / 100}%`
  return 'IVA'
}

function ensureSpace(doc, y, needed) {
  if (y + needed <= 282) return y
  doc.addPage()
  drawHeader(doc)
  return 48
}

function drawTotals(doc, factura, items, y) {
  y = ensureSpace(doc, y, 34)
  const x = 108
  const w = 94
  doc.setDrawColor(...BORDER)
  roundedRect(doc, x, y, w, 30)
  const rows = [
    ['SUBTOTAL 0%', formatMoney(factura.Subtotal0 || factura.SubtotalWithoutTax)],
    [totalTaxLabel(items), formatMoney(factura.TaxTotal)],
  ]
  rows.forEach((row, index) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    setText(doc, TEXT)
    doc.text(row[0], x + 4, y + 7 + index * 10)
    doc.text(row[1], x + w - 6, y + 7 + index * 10, { align: 'right' })
    doc.setDrawColor(...LIGHT_BORDER)
    doc.setLineDashPattern([1, 1], 0)
    doc.line(x, y + 10 + index * 10, x + w, y + 10 + index * 10)
    doc.setLineDashPattern([], 0)
  })
  doc.setFillColor(...NAVY)
  doc.rect(x, y + 20, w, 10, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(255, 255, 255)
  doc.text('TOTAL A PAGAR', x + 4, y + 27)
  doc.text(formatMoney(factura.GrandTotal), x + w - 6, y + 27, { align: 'right' })
  return y + 37
}

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

function drawAuthorization(doc, factura, y) {
  y = ensureSpace(doc, y, 61)
  doc.setDrawColor(...BORDER)
  roundedRect(doc, 8, y, 194, 61)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  setText(doc, NAVY)
  doc.text('CLAVE DE ACCESO / AUTORIZACION', 12, y + 7)
  doc.setDrawColor(...BORDER)
  doc.rect(12, y + 11, 186, 10)
  doc.setFontSize(12)
  doc.text(text(factura.AccessKey, '-'), 105, y + 18, { align: 'center' })

  drawQr(doc, qrPayloadForFactura(factura), 14, y + 27, 31)
  doc.setDrawColor(...LIGHT_BORDER)
  doc.setLineDashPattern([1, 1], 0)
  doc.line(58, y + 26, 58, y + 56)
  doc.line(138, y + 26, 138, y + 56)
  doc.setLineDashPattern([], 0)

  const rows = [
    ['Estado de autorizacion', statusLabel(factura)],
    ['Fecha y hora de autorizacion', formatRideDate(factura.AuthorizationDate, true)],
    ['Entidad autorizadora', text(factura.AuthorizationEntity, 'SERVICIO DE RENTAS INTERNAS')],
  ]
  let rowY = y + 32
  rows.forEach((row, index) => {
    drawMiniIcon(doc, index === 0 ? 'check' : index === 1 ? 'calendar' : 'bank', 63, rowY - 4)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    setText(doc, TEXT)
    doc.text(row[0], 74, rowY)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(split(doc, row[1], 56), 74, rowY + 5)
    if (index < rows.length - 1) {
      doc.setDrawColor(...LIGHT_BORDER)
      doc.setLineDashPattern([1, 1], 0)
      doc.line(74, rowY + 8, 132, rowY + 8)
      doc.setLineDashPattern([], 0)
    }
    rowY += 11
  })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  setText(doc, TEXT)
  doc.text(split(doc, 'Verifique su validez escaneando el codigo QR o ingresando la clave de acceso en el portal del SRI.', 52), 144, y + 34)
  return y + 68
}

function drawFooter(doc) {
  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    doc.setDrawColor(...NAVY)
    doc.setLineWidth(0.5)
    doc.line(8, 284, 202, 284)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    setText(doc, NAVY)
    doc.text('Representacion impresa del comprobante electronico.', 105, 291, { align: 'center' })
  }
}

export function buildRidePdfBytes(factura, items = []) {
  if (!factura || typeof factura !== 'object') throw new RidePdfError('Se requiere la factura autorizada para generar el RIDE.')
  if (factura.SriAuthorizationStatus !== 'AUTORIZADO' && factura.Status !== 'DELIVERY_PENDING' && factura.Status !== 'DELIVERED') {
    throw new RidePdfError('Solo se puede generar RIDE para una factura autorizada.')
  }
  if (!factura.AuthorizationNumber) throw new RidePdfError('La factura autorizada no tiene numero de autorizacion.')
  if (!qrPayloadForFactura(factura)) throw new RidePdfError('La factura autorizada no tiene clave de acceso para el QR.')

  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  doc.setProperties({
    title: `RIDE ${documentNumber(factura)}`,
    subject: 'Representacion impresa de documento electronico',
    creator: 'R.A. Training Finance',
  })

  drawHeader(doc)
  drawSummary(doc, factura)
  drawInfoCard(doc, {
    title: 'EMISOR',
    icon: 'building',
    rows: [
      { label: 'Razon social / emisor', value: issuerName(factura) },
      { label: 'RUC', value: issuerRucLabel(factura) },
    ],
  }, 8, 73, 96, 45)
  drawInfoCard(doc, {
    title: 'CLIENTE',
    icon: 'person',
    rows: [
      { label: 'Cliente', value: text(factura.BuyerName) },
      { label: 'Identificacion', value: text(factura.BuyerIdentification) },
      { label: 'Email', value: text(factura.BuyerEmail) },
    ],
  }, 108, 73, 94, 45)
  drawEmissionInfo(doc, factura)
  const safeItems = normalizeItems(factura, items)
  let y = addDetailTable(doc, factura, safeItems)
  y = drawTotals(doc, factura, safeItems, y)
  drawAuthorization(doc, factura, y)
  drawFooter(doc)

  return new Uint8Array(doc.output('arraybuffer'))
}

export function sha256Hex(bytes) {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}
