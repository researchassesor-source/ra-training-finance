import { callGasActionAsUser } from '../../lib/fiscal/orchestration/gasClient.js'
import { getFiscalUserToken } from '../../lib/fiscal/httpAuth.js'

const DETAIL_LIMIT = 120

function str(value) {
  return value === null || value === undefined ? '' : String(value)
}

function normalizeStatus(value) {
  return str(value).trim().toUpperCase()
}

function documentNumberOf(row) {
  return row.DocumentNumber || [row.Establishment, row.EmissionPoint, row.Sequential].filter(Boolean).join('-')
}

function truncate(value, max = 220) {
  const text = str(value).replace(/[\u0000-\u001f]+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max)}...` : text
}

function sanitizeItem(item = {}) {
  return {
    id: item.ID || '',
    codigo: item.Codigo || '',
    descripcion: item.Descripcion || '',
    cantidad: Number(item.Cantidad) || 0,
    precioUnitarioCents: Number(item.PrecioUnitarioCents) || 0,
    descuentoCents: Number(item.DescuentoCents) || 0,
    baseCents: Number(item.BaseCents) || 0,
    totalCents: Number(item.TotalCents) || 0,
    taxRateBasisPoints: Number(item.TaxRateBasisPoints) || 0,
    sriTaxCode: item.SriTaxCode || '',
    catalogVersion: item.CatalogVersion || '',
  }
}

/**
 * Trazabilidad de origen (solo lectura, no fiscal): a partir de InscripcionID ya
 * persistido en FacturasFiscales, adjunta el comprobante de pago/curso que originó
 * la factura -- SOLO si existe un match real por ID (nunca se infiere por nombre o
 * monto). Degrada a null si la inscripción no existe o no tiene InscripcionID
 * (facturas legacy/manuales) -- la UI debe mostrar "No disponible" en ese caso.
 */
function sanitizeOrigin(inscripcion) {
  if (!inscripcion) return null
  return {
    id: inscripcion.ID || '',
    servicioNombre: inscripcion.ServicioNombre || '',
    numeroComprobante: inscripcion.NumeroComprobante || '',
    fechaPago: inscripcion.FechaPago || '',
    metodoPago: inscripcion.MetodoPago || '',
  }
}

function sanitizeFactura(row = {}, items = [], inscripcionPorId = {}) {
  return {
    id: row.ID || '',
    environment: row.Environment || '',
    status: row.Status || '',
    inscripcionId: row.InscripcionID || '',
    originInscripcion: sanitizeOrigin(inscripcionPorId[row.InscripcionID]),
    documentType: row.DocumentType || '',
    issueDate: row.IssueDate || row.CreatedAt || '',
    documentNumber: documentNumberOf(row),
    establishment: row.Establishment || '',
    emissionPoint: row.EmissionPoint || '',
    sequential: row.Sequential || '',
    accessKey: row.AccessKey || '',
    buyerName: row.BuyerName || '',
    buyerIdentification: row.BuyerIdentification || '',
    buyerEmail: row.BuyerEmail || '',
    buyerAddress: row.BuyerAddress || '',
    subtotalWithoutTax: Number(row.SubtotalWithoutTax) || 0,
    subtotal0: Number(row.Subtotal0) || 0,
    subtotalTaxed: Number(row.SubtotalTaxed) || 0,
    discountCents: Number(row.DiscountCents) || 0,
    taxTotal: Number(row.TaxTotal) || 0,
    grandTotal: Number(row.GrandTotal) || 0,
    currency: row.Currency || 'USD',
    paymentMethodInternal: row.PaymentMethodInternal || '',
    sriPaymentCode: row.SriPaymentCode || '',
    sriReceptionStatus: row.SriReceptionStatus || '',
    sriAuthorizationStatus: row.SriAuthorizationStatus || '',
    authorizationNumber: row.AuthorizationNumber || '',
    authorizationDate: row.AuthorizationDate || '',
    retryCount: Number(row.RetryCount) || 0,
    lastSriMessage: truncate(row.LastSriMessage),
    reviewFlag: row.ReviewFlag || '',
    reviewReason: truncate(row.ReviewReason),
    createdAt: row.CreatedAt || '',
    updatedAt: row.UpdatedAt || '',
    authorizedAt: row.AuthorizedAt || '',
    deliveredAt: row.DeliveredAt || '',
    rideAvailable: Boolean(row.RideReference || row.Sha256Ride),
    xmlAvailable: Boolean(row.XmlAuthorizedReference || row.Sha256Authorized || row.XmlAuthorizedContent),
    items: items.map(sanitizeItem),
  }
}

function matchesSearch(factura, q) {
  if (!q) return true
  const haystack = [
    factura.id,
    factura.documentNumber,
    factura.buyerName,
    factura.buyerIdentification,
    factura.buyerEmail,
    factura.inscripcionId,
    factura.originInscripcion?.numeroComprobante,
    factura.originInscripcion?.servicioNombre,
    ...factura.items.map(item => item.descripcion),
  ].join(' ').toLowerCase()
  return haystack.includes(q.toLowerCase())
}

function inDateRange(factura, desde, hasta) {
  const date = str(factura.issueDate || factura.createdAt).slice(0, 10)
  if (desde && date && date < desde) return false
  if (hasta && date && date > hasta) return false
  return true
}

function buildSummary(items) {
  return {
    total: items.length,
    autorizadas: items.filter(item => ['AUTHORIZED', 'DELIVERY_PENDING', 'DELIVERED'].includes(normalizeStatus(item.status))).length,
    procesando: items.filter(item => ['SUBMITTING', 'RECEIVED', 'PROCESSING'].includes(normalizeStatus(item.status))).length,
    novedad: items.filter(item => ['NOT_AUTHORIZED', 'RETURNED'].includes(normalizeStatus(item.status)) || item.reviewFlag).length,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Método no permitido' })
    return
  }

  const { environment = 'production', status = '', q = '', desde = '', hasta = '' } = req.query || {}
  const token = getFiscalUserToken(req)
  if (!token) {
    res.status(400).json({ success: false, error: 'token es obligatorio.' })
    return
  }

  try {
    const params = { environment }
    if (status) params.status = status
    const rows = await callGasActionAsUser('getFacturasFiscales', params, token, { timeoutMs: 45_000 })
    const baseRows = Array.isArray(rows) ? rows : []

    // Trazabilidad de origen (solo lectura): un único fetch adicional de Inscripciones
    // para poder mostrar el comprobante/curso que originó cada factura. Si falla, se
    // degrada a "sin origen" para cada factura -- nunca rompe el listado completo.
    let inscripcionPorId = {}
    try {
      const inscripciones = await callGasActionAsUser('getInscripciones', { filtros: {} }, token, { timeoutMs: 45_000 })
      inscripcionPorId = (Array.isArray(inscripciones) ? inscripciones : []).reduce((map, ins) => {
        if (ins?.ID) map[ins.ID] = ins
        return map
      }, {})
    } catch {
      inscripcionPorId = {}
    }

    const enriched = await Promise.all(baseRows.slice(0, DETAIL_LIMIT).map(async row => {
      try {
        const detail = await callGasActionAsUser('getFacturaFiscalCompleta', { facturaId: row.ID }, token, { timeoutMs: 45_000 })
        return sanitizeFactura(detail.factura || row, Array.isArray(detail.items) ? detail.items : [], inscripcionPorId)
      } catch {
        return sanitizeFactura(row, [], inscripcionPorId)
      }
    }))
    const remaining = baseRows.slice(DETAIL_LIMIT).map(row => sanitizeFactura(row, [], inscripcionPorId))
    const items = [...enriched, ...remaining]
      .filter(item => matchesSearch(item, q))
      .filter(item => inDateRange(item, desde, hasta))
      .sort((a, b) => str(b.issueDate || b.createdAt).localeCompare(str(a.issueDate || a.createdAt)))

    res.status(200).json({ success: true, data: { items, summary: buildSummary(items), environment } })
  } catch {
    res.status(403).json({ success: false, error: 'No autorizado o no se pudo consultar la facturación.' })
  }
}
