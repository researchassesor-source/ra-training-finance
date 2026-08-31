import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { saveAs } from 'file-saver'
import { Download, Eye, FileCode2, FileText, Mail, MessageCircle, RefreshCw, Search, UserSearch } from 'lucide-react'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import Modal from '../UI/Modal'
import TableSkeleton from '../UI/TableSkeleton'
import {
  ACTIVE_FISCAL_STATUSES,
  centsToUsd,
  documentNumberOf,
  fiscalEnvironmentLabel,
  fiscalHumanStatus,
  fiscalPaymentLabel,
  fiscalSriStatus,
} from '../../utils/fiscalUi'
import { fmt } from '../../utils/formatters'

const STATUS_OPTIONS = [
  ['', 'Todos los estados'],
  ['DRAFT', 'Borrador'],
  ['SEQUENCE_RESERVED', 'Preparando'],
  ['PROCESSING', 'Procesando en SRI'],
  ['AUTHORIZED', 'Autorizada'],
  ['DELIVERED', 'Entregada'],
  ['NOT_AUTHORIZED', 'No autorizada'],
]

/** Estados en los que refreshInvoice todavía tiene algo que avanzar -- para
 * AUTHORIZED/DELIVERY_PENDING eso es cerrarEntregaFiscal (genera RIDE y cierra como
 * DELIVERED), nunca una nueva llamada al SRI. DELIVERED/NOT_AUTHORIZED/RETURNED/DRAFT
 * quedan fuera porque no tienen una acción de avance automática desde aquí. */
const ADVANCEABLE_FISCAL_STATUSES = new Set([
  'SEQUENCE_RESERVED', 'GENERATED', 'SIGNED', 'SUBMITTING', 'RECEIVED', 'PROCESSING', 'AUTHORIZED', 'DELIVERY_PENDING',
])
const DELIVERY_READY_STATUSES = new Set(['AUTHORIZED', 'DELIVERY_PENDING'])

function firstConcept(factura) {
  return factura.items?.[0]?.descripcion || factura.concept || factura.course || 'Sin detalle registrado'
}

function Badge({ info }) {
  return <span className={info.css}>{info.label}</span>
}

function InfoItem({ label, value }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-900 break-words">{value || '—'}</p>
    </div>
  )
}

function SummaryCard({ label, value, tone = 'text-gray-900' }) {
  return (
    <div className="card p-4">
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  )
}

function normalizeWhatsappPhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('00')) return digits.slice(2)
  if (digits.startsWith('593')) return digits
  if (digits.length === 10 && digits.startsWith('0')) return `593${digits.slice(1)}`
  return digits
}

function invoiceCourse(factura) {
  return factura.items?.[0]?.descripcion || factura.originInscripcion?.servicioNombre || factura.concept || factura.course || ''
}

function buildFiscalDeliveryMessage(factura, links = {}) {
  const numero = documentNumberOf(factura) || factura.id
  const curso = invoiceCourse(factura)
  const lines = [
    `Hola ${factura.buyerName || 'estimado/a'} 👋`,
    '',
    'Le compartimos su factura electrónica autorizada por el SRI.',
    '',
    `Factura: ${numero}`,
    curso ? `Curso/servicio: ${curso}` : '',
    `Total: ${centsToUsd(factura.grandTotal)}`,
    factura.authorizationNumber ? `Autorización: ${factura.authorizationNumber}` : '',
    '',
    links.ride ? `RIDE PDF: ${links.ride}` : '',
    links.xml ? `XML autorizado: ${links.xml}` : '',
    '',
    'Gracias por confiar en R.A. Training Finance.',
  ].filter(line => line !== '')
  return lines.join('\n')
}

/** Deep link desde Inscripciones: /facturacion?factura=<ID> o ?inscripcion=<ID>.
 * Sin parámetros, el comportamiento es exactamente el de antes. */
function readDeepLinkParams() {
  if (typeof window === 'undefined') return { factura: '', inscripcion: '' }
  const params = new URLSearchParams(window.location.search)
  return {
    factura: String(params.get('factura') || '').trim(),
    inscripcion: String(params.get('inscripcion') || '').trim(),
  }
}

export default function FacturacionView() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const deepLink = useMemo(readDeepLinkParams, [])
  const deepLinkTarget = deepLink.factura || deepLink.inscripcion
  const deepLinkOpened = useRef(false)
  const [filters, setFilters] = useState({ q: deepLinkTarget, status: '', desde: '', hasta: '', environment: 'production' })
  const [data, setData] = useState([])
  const [summary, setSummary] = useState({ total: 0, autorizadas: 0, procesando: 0, novedad: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState('')

  const hasActive = useMemo(
    () => data.some(item => ACTIVE_FISCAL_STATUSES.has(String(item.status || '').toUpperCase())),
    [data],
  )

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const result = await api.getFacturasFiscales(filters)
      setData(result.data?.items || [])
      setSummary(result.data?.summary || { total: 0, autorizadas: 0, procesando: 0, novedad: 0 })
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [filters])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!deepLinkTarget || deepLinkOpened.current || loading) return
    deepLinkOpened.current = true
    const match = data.find(item => (
      (deepLink.factura && item.id === deepLink.factura)
      || (deepLink.inscripcion && item.inscripcionId === deepLink.inscripcion)
    ))
    if (match) setSelected(match)
    else setError('No se encontró la factura solicitada por el enlace.')
  }, [data, loading, deepLink, deepLinkTarget])

  useEffect(() => {
    if (!hasActive) return undefined
    const id = window.setInterval(() => load({ silent: true }), 15_000)
    return () => window.clearInterval(id)
  }, [hasActive, load])

  function updateFilter(key, value) {
    setFilters(current => ({ ...current, [key]: value }))
  }

  async function downloadDocument(factura, tipo) {
    setBusy(`${tipo}:${factura.id}`)
    setError('')
    try {
      const doc = await api.descargarDocumentoFiscal(factura.id, tipo)
      const fallback = `${tipo === 'XML_AUTORIZADO' ? 'factura' : 'ride'}_${documentNumberOf(factura) || factura.id}.${tipo === 'XML_AUTORIZADO' ? 'xml' : 'pdf'}`
      saveAs(doc.blob, doc.filename || fallback)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function sendInvoiceEmail(factura) {
    setBusy(`email:${factura.id}`)
    setError('')
    setNotice('')
    try {
      await api.enviarFacturaFiscalEmail(factura.id, factura.buyerEmail || '')
      setNotice('Factura enviada por email con XML y RIDE adjuntos.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function openInvoiceWhatsapp(factura) {
    setBusy(`whatsapp:${factura.id}`)
    setError('')
    setNotice('')
    try {
      const shared = await api.generarLinksFacturaFiscal(factura.id)
      const links = shared.data?.links || {}
      const phone = normalizeWhatsappPhone(factura.buyerPhone || factura.originInscripcion?.clienteTelefono)
      const text = buildFiscalDeliveryMessage(factura, { ride: links.ride, xml: links.xml })
      const url = phone
        ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
        : `https://wa.me/?text=${encodeURIComponent(text)}`
      window.open(url, '_blank', 'noopener,noreferrer')
      setNotice(phone
        ? 'WhatsApp abierto con mensaje y enlaces seguros listos para enviar.'
        : 'WhatsApp abierto con mensaje y enlaces seguros. Selecciona el contacto porque la factura no tiene teléfono.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function refreshInvoice(factura) {
    setBusy(`refresh:${factura.id}`)
    setError('')
    setNotice('')
    try {
      if (['AUTHORIZED', 'DELIVERY_PENDING'].includes(String(factura.status || '').toUpperCase())) {
        await api.cerrarEntregaFiscal(factura.id)
      } else {
        await api.procesarFacturaFiscal(factura.id)
      }
      setNotice('Estado fiscal actualizado correctamente.')
      await load({ silent: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Facturación</h1>
          <p className="text-sm text-gray-500">Control administrativo de comprobantes electrónicos y documentos autorizados.</p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => load()} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Total facturas" value={summary.total} />
        <SummaryCard label="Autorizadas" value={summary.autorizadas} tone="text-green-600" />
        <SummaryCard label="Procesando" value={summary.procesando} tone="text-amber-600" />
        <SummaryCard label="Con novedad" value={summary.novedad} tone="text-red-600" />
      </div>

      <div className="card space-y-3 p-4">
        <div className="grid gap-3 lg:grid-cols-5">
          <label className="relative lg:col-span-2">
            <Search size={16} className="absolute left-3 top-3.5 text-gray-400" />
            <input className="input pl-9" placeholder="Buscar cliente, identificación o factura" value={filters.q} onChange={e => updateFilter('q', e.target.value)} />
          </label>
          <select className="input" value={filters.status} onChange={e => updateFilter('status', e.target.value)}>
            {STATUS_OPTIONS.map(([value, label]) => <option key={value || 'all'} value={value}>{label}</option>)}
          </select>
          <select className="input" value={filters.environment} onChange={e => updateFilter('environment', e.target.value)}>
            <option value="production">Producción</option>
            <option value="test">Pruebas</option>
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input aria-label="Fecha desde" className="input" type="date" value={filters.desde} onChange={e => updateFilter('desde', e.target.value)} />
            <input aria-label="Fecha hasta" className="input" type="date" value={filters.hasta} onChange={e => updateFilter('hasta', e.target.value)} />
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>}

      {loading ? <TableSkeleton cols={10} rows={5} /> : (
        <div className="card overflow-hidden p-0">
          {data.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <FileText className="text-gray-300" size={40} />
              <p className="font-semibold text-gray-700">No hay facturas para estos filtros.</p>
              <p className="text-sm text-gray-500">Cuando se confirme un pago facturable aparecerá aquí.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Factura</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Concepto/Curso</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">IVA</th>
                    <th className="px-4 py-3">Pago</th>
                    <th className="px-4 py-3">SRI</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(factura => {
                    const status = fiscalHumanStatus(factura.status)
                    const sri = fiscalSriStatus(factura)
                    const rawStatus = String(factura.status || '').toUpperCase()
                    const showAdvanceAction = isAdmin && ADVANCEABLE_FISCAL_STATUSES.has(rawStatus)
                    const advanceActionTitle = DELIVERY_READY_STATUSES.has(rawStatus) ? 'Preparar documentos' : 'Actualizar estado'
                    return (
                      <tr key={factura.id} className="border-b border-gray-50 align-top last:border-0">
                        <td className="px-4 py-3 text-gray-600">{fmt.date(factura.issueDate || factura.createdAt)}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{documentNumberOf(factura)}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-900">{factura.buyerName || 'Sin cliente'}</p>
                          <p className="text-xs text-gray-500">{factura.buyerIdentification || 'Sin identificación'}</p>
                        </td>
                        <td className="max-w-xs px-4 py-3 text-gray-600">{firstConcept(factura)}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900">{centsToUsd(factura.grandTotal)}</td>
                        <td className="px-4 py-3">{centsToUsd(factura.taxTotal)}</td>
                        <td className="px-4 py-3 text-gray-600">{fiscalPaymentLabel(factura)}</td>
                        <td className="px-4 py-3"><Badge info={sri} /></td>
                        <td className="px-4 py-3"><Badge info={status} /></td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <button className="btn-secondary px-2 py-1.5" title="Ver detalle" onClick={() => setSelected(factura)}><Eye size={16} /></button>
                            {factura.inscripcionId && (
                              <button className="btn-secondary px-2 py-1.5" title="Ver inscripción de origen" onClick={() => navigate(`/inscripciones?open=${encodeURIComponent(factura.inscripcionId)}`)}><UserSearch size={16} /></button>
                            )}
                            <button className="btn-secondary px-2 py-1.5" title="Descargar XML" disabled={!factura.xmlAvailable || busy === `XML_AUTORIZADO:${factura.id}`} onClick={() => downloadDocument(factura, 'XML_AUTORIZADO')}><FileCode2 size={16} /></button>
                            <button className="btn-secondary px-2 py-1.5" title="Descargar RIDE" disabled={!factura.rideAvailable || busy === `RIDE:${factura.id}`} onClick={() => downloadDocument(factura, 'RIDE')}><Download size={16} /></button>
                            {showAdvanceAction && (
                              <button className="btn-secondary px-2 py-1.5" title={advanceActionTitle} disabled={busy === `refresh:${factura.id}`} onClick={() => refreshInvoice(factura)}><RefreshCw size={16} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title={`Factura ${selected ? documentNumberOf(selected) : ''}`} size="xl">
        {selected && (
          <div className="space-y-5">
            <section>
              <h3 className="mb-2 font-semibold text-gray-900">Comprobante</h3>
              <div className="grid gap-3 md:grid-cols-3">
                <InfoItem label="Ambiente" value={fiscalEnvironmentLabel(selected.environment)} />
                <InfoItem label="Estado" value={fiscalHumanStatus(selected.status).label} />
                <InfoItem label="Autorización" value={selected.authorizationNumber || 'Pendiente'} />
              </div>
            </section>
            <section>
              <h3 className="mb-2 font-semibold text-gray-900">Cliente</h3>
              <div className="grid gap-3 md:grid-cols-3">
                <InfoItem label="Razón social / participante" value={selected.buyerName} />
                <InfoItem label="Identificación" value={selected.buyerIdentification} />
                <InfoItem label="Correo" value={selected.buyerEmail || 'No registrado'} />
              </div>
            </section>
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Origen comercial</h3>
                {selected.inscripcionId && (
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    onClick={() => navigate(`/inscripciones?open=${encodeURIComponent(selected.inscripcionId)}`)}
                  >
                    <UserSearch size={14} /> Ver inscripción
                  </button>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <InfoItem label="Curso / servicio" value={selected.originInscripcion?.servicioNombre} />
                <InfoItem label="N.º comprobante / referencia" value={selected.originInscripcion?.numeroComprobante || 'No disponible'} />
                <InfoItem label="Fecha de pago" value={selected.originInscripcion?.fechaPago ? fmt.date(selected.originInscripcion.fechaPago) : 'No disponible'} />
              </div>
            </section>
            <section>
              <h3 className="mb-2 font-semibold text-gray-900">Detalle</h3>
              <div className="space-y-2">
                {(selected.items || []).map(item => (
                  <div key={item.id || item.descripcion} className="rounded-xl border border-gray-100 p-3">
                    <p className="font-semibold text-gray-900">{item.descripcion}</p>
                    <p className="text-sm text-gray-500">Código {item.codigo} · SriTaxCode {item.sriTaxCode || '—'} · IVA {item.taxRateBasisPoints / 100}%</p>
                    <p className="text-sm font-semibold text-gray-900">{centsToUsd(item.totalCents)}</p>
                  </div>
                ))}
              </div>
            </section>
            <section>
              <h3 className="mb-2 font-semibold text-gray-900">Pago y totales</h3>
              <div className="grid gap-3 md:grid-cols-4">
                <InfoItem label="Forma de pago" value={fiscalPaymentLabel(selected)} />
                <InfoItem label="Subtotal" value={centsToUsd(selected.subtotalWithoutTax)} />
                <InfoItem label="IVA" value={centsToUsd(selected.taxTotal)} />
                <InfoItem label="Total" value={centsToUsd(selected.grandTotal)} />
              </div>
            </section>
            <section>
              <h3 className="mb-2 font-semibold text-gray-900">Documentos</h3>
              <div className="flex flex-wrap gap-2">
                <button className="btn-secondary" disabled={!selected.xmlAvailable} onClick={() => downloadDocument(selected, 'XML_AUTORIZADO')}><FileCode2 size={16} /> Descargar XML</button>
                <button className="btn-secondary" disabled={!selected.rideAvailable} onClick={() => downloadDocument(selected, 'RIDE')}><FileText size={16} /> Descargar RIDE</button>
                <button
                  className="btn-secondary"
                  disabled={!selected.xmlAvailable || !selected.rideAvailable || busy === `email:${selected.id}`}
                  onClick={() => sendInvoiceEmail(selected)}
                  title={selected.buyerEmail ? 'Enviar factura por email' : 'La factura no tiene correo para entrega automática'}
                >
                  <Mail size={16} /> Enviar email
                </button>
                <button
                  className="btn-secondary"
                  disabled={!selected.xmlAvailable || !selected.rideAvailable || busy === `whatsapp:${selected.id}`}
                  onClick={() => openInvoiceWhatsapp(selected)}
                  title={selected.buyerPhone || selected.originInscripcion?.clienteTelefono ? 'Abrir WhatsApp del cliente con enlaces' : 'Abrir WhatsApp con mensaje listo'}
                >
                  <MessageCircle size={16} /> WhatsApp
                </button>
              </div>
            </section>
            <section>
              <h3 className="mb-2 font-semibold text-gray-900">Información avanzada</h3>
              <div className="grid gap-3 md:grid-cols-3">
                <InfoItem label="Factura ID" value={selected.id} />
                <InfoItem label="AccessKey" value={selected.accessKey || 'Pendiente'} />
                <InfoItem label="Último mensaje SRI" value={selected.lastSriMessage || 'Sin novedades'} />
              </div>
            </section>
          </div>
        )}
      </Modal>
    </div>
  )
}
