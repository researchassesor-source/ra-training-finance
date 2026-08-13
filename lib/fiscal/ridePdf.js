import { createHash } from 'node:crypto'
import { jsPDF } from 'jspdf'

export class RidePdfError extends Error {}

function text(value, fallback = '') {
  const v = value === null || value === undefined ? '' : String(value)
  return v.trim() || fallback
}

function money(value) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n.toFixed(2) : '0.00'
}

function addLabel(doc, label, value, x, y, width = 80) {
  doc.setFont('helvetica', 'bold')
  doc.text(label, x, y)
  doc.setFont('helvetica', 'normal')
  doc.text(doc.splitTextToSize(text(value, '-'), width), x, y + 5)
}

export function buildRidePdfBytes(factura, items = []) {
  if (!factura || typeof factura !== 'object') throw new RidePdfError('Se requiere la factura autorizada para generar el RIDE.')
  if (factura.SriAuthorizationStatus !== 'AUTORIZADO' && factura.Status !== 'DELIVERY_PENDING' && factura.Status !== 'DELIVERED') {
    throw new RidePdfError('Solo se puede generar RIDE para una factura autorizada.')
  }
  if (!factura.AuthorizationNumber) throw new RidePdfError('La factura autorizada no tiene número de autorización.')

  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  doc.setProperties({
    title: `RIDE ${text(factura.DocumentNumber || factura.AccessKey)}`,
    subject: 'Representación impresa de documento electrónico',
    creator: 'R.A. Training Finance',
  })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('R.A. TRAINING FINANCE', 14, 16)
  doc.setFontSize(11)
  doc.text('RIDE - FACTURA ELECTRÓNICA', 130, 16)

  doc.setDrawColor(20, 64, 120)
  doc.rect(12, 22, 186, 34)
  doc.setFontSize(9)
  addLabel(doc, 'RUC EMISOR', factura.IssuerRuc, 16, 30, 60)
  addLabel(doc, 'RAZÓN SOCIAL', 'RESEARCH ASSESSOR TRAINING S.A.S.', 16, 43, 90)
  addLabel(doc, 'NÚMERO', factura.DocumentNumber || `${factura.Establishment}-${factura.EmissionPoint}-${factura.Sequential}`, 125, 30, 60)
  addLabel(doc, 'AMBIENTE', factura.Environment === 'production' ? 'PRODUCCIÓN' : 'PRUEBAS', 125, 43, 60)

  doc.rect(12, 60, 186, 42)
  addLabel(doc, 'CLAVE DE ACCESO', factura.AccessKey, 16, 68, 170)
  addLabel(doc, 'AUTORIZACIÓN', factura.AuthorizationNumber, 16, 82, 170)
  addLabel(doc, 'FECHA AUTORIZACIÓN', factura.AuthorizationDate, 125, 82, 60)
  addLabel(doc, 'FECHA EMISIÓN', factura.IssueDate, 16, 95, 60)

  doc.rect(12, 106, 186, 34)
  addLabel(doc, 'COMPRADOR', factura.BuyerName, 16, 114, 105)
  addLabel(doc, 'IDENTIFICACIÓN', factura.BuyerIdentification, 125, 114, 60)
  addLabel(doc, 'EMAIL', factura.BuyerEmail, 16, 128, 80)
  addLabel(doc, 'DIRECCIÓN', factura.BuyerAddress, 100, 128, 90)

  const startY = 150
  doc.setFillColor(20, 64, 120)
  doc.setTextColor(255, 255, 255)
  doc.rect(12, startY, 186, 8, 'F')
  doc.text('Código', 16, startY + 5.5)
  doc.text('Descripción', 42, startY + 5.5)
  doc.text('Cant.', 125, startY + 5.5)
  doc.text('P.Unit.', 143, startY + 5.5)
  doc.text('Total', 170, startY + 5.5)
  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'normal')

  let y = startY + 14
  const safeItems = Array.isArray(items) && items.length ? items : [{
    Codigo: 'ITEM',
    Descripcion: factura.Description || 'Servicio facturado',
    Cantidad: 1,
    PrecioUnitarioCents: Number(factura.GrandTotal || 0) * 100,
    TotalCents: Number(factura.GrandTotal || 0) * 100,
  }]
  for (const item of safeItems.slice(0, 12)) {
    doc.text(text(item.Codigo || item.ID, '-').slice(0, 12), 16, y)
    doc.text(doc.splitTextToSize(text(item.Descripcion, '-'), 76), 42, y)
    doc.text(text(item.Cantidad, '1'), 125, y)
    doc.text(money(Number(item.PrecioUnitarioCents || 0) / 100), 143, y)
    doc.text(money(Number(item.TotalCents || item.BaseCents || 0) / 100), 170, y)
    y += 12
  }

  y = Math.max(y + 4, 218)
  doc.rect(118, y - 8, 80, 34)
  addLabel(doc, 'SUBTOTAL 0%', factura.Subtotal0 || factura.SubtotalWithoutTax, 124, y, 60)
  addLabel(doc, 'IVA', factura.TaxTotal, 124, y + 11, 60)
  addLabel(doc, 'TOTAL', factura.GrandTotal, 124, y + 22, 60)

  doc.setFontSize(8)
  doc.text('Representación impresa de documento electrónico autorizado por el SRI.', 14, 282)
  doc.text('Consulte la validez con la clave de acceso en los servicios oficiales del SRI.', 14, 287)

  return new Uint8Array(doc.output('arraybuffer'))
}

export function sha256Hex(bytes) {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}
