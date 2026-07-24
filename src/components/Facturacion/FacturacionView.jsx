import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, BookOpenCheck, CheckCircle2, ChevronLeft, ChevronRight,
  FilePlus2, FileText, Filter, Loader2, Receipt, RefreshCw, Search, Settings2,
  ShieldCheck, TrendingUp, UserRoundCheck, X,
} from 'lucide-react'
import { fiscalApi } from '../../services/fiscalApi'
import { fiscalStatusLabel } from '../../utils/fiscalFeature'
import FiscalBanner from './FiscalBanner'
import InvoiceFormModal from './InvoiceFormModal'
import InvoiceDetailModal from './InvoiceDetailModal'
import FiscalConfigurationPanel from './FiscalConfigurationPanel'
import FiscalCatalogPanel from './FiscalCatalogPanel'

const PAGE_SIZE = 10
const errorStatuses = ['RETURNED', 'NOT_AUTHORIZED', 'ERROR', 'VALIDATION_FAILED']
const badge = (status) => status === 'AUTHORIZED' ? 'badge-green' : errorStatuses.includes(status) ? 'badge-red' : status === 'DRAFT' ? 'badge-gray' : 'badge-blue'
const typeLabel = (type) => type === 'INVOICE' ? 'Factura' : 'Nota de crédito'
const documentNumber = (document) => `${document.establishmentCode}-${document.emissionPointCode}-${document.sequential || 'PENDIENTE'}`

function DocumentList({ documents, onOpen, emptyText = 'No existen documentos para mostrar.' }) {
  return <>
    <div className="hidden border-t lg:block">
      <table className="w-full table-fixed text-left text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr>
          <th className="w-[13%] px-4 py-3">Fecha</th><th className="w-[16%] px-4 py-3">Tipo / número</th>
          <th className="w-[23%] px-4 py-3">Cliente</th><th className="w-[17%] px-4 py-3">Estado</th>
          <th className="w-[13%] px-4 py-3 text-right">Total</th><th className="w-[18%] px-4 py-3 text-right">Acción</th>
        </tr></thead>
        <tbody>{documents.map((document) => <tr key={document.id} className="border-t hover:bg-gray-50">
          <td className="px-4 py-3">{document.issueDate}</td>
          <td className="px-4 py-3"><p className="text-xs text-gray-500">{typeLabel(document.documentType)}</p><p className="truncate font-mono text-xs" title={documentNumber(document)}>{documentNumber(document)}</p></td>
          <td className="px-4 py-3"><p className="truncate font-medium">{document.customer.legalName}</p><p className="truncate text-xs text-gray-500">{document.customer.identification}</p></td>
          <td className="px-4 py-3"><span className={badge(document.status)}>{fiscalStatusLabel[document.status] || document.status}</span></td>
          <td className="px-4 py-3 text-right font-semibold">${document.grandTotal}</td>
          <td className="px-4 py-3 text-right"><button className="btn-secondary px-3" onClick={() => onOpen(document)}><FileText size={15} /> Ver detalle</button></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="divide-y border-t lg:hidden">{documents.map((document) => <article key={document.id} className="p-4">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs text-gray-500">{typeLabel(document.documentType)} · {document.issueDate}</p><p className="truncate font-semibold">{document.customer.legalName}</p><p className="mt-1 break-all font-mono text-[11px] text-gray-500">{documentNumber(document)}</p></div><strong className="shrink-0">${document.grandTotal}</strong></div>
      <div className="mt-3 flex items-center justify-between gap-2"><span className={badge(document.status)}>{fiscalStatusLabel[document.status] || document.status}</span><button className="btn-secondary px-3" onClick={() => onOpen(document)}>Ver</button></div>
    </article>)}</div>
    {!documents.length && <div className="border-t p-10 text-center text-sm text-gray-500">{emptyText}</div>}
  </>
}

export default function FacturacionView() {
  const [tab, setTab] = useState('panel')
  const [config, setConfig] = useState(null)
  const [sources, setSources] = useState([])
  const [documents, setDocuments] = useState([])
  const [readiness, setReadiness] = useState(null)
  const [catalog, setCatalog] = useState(null)
  const [paymentMethods, setPaymentMethods] = useState([])
  const [selectedSource, setSelectedSource] = useState(null)
  const [selected, setSelected] = useState(null)
  const [events, setEvents] = useState([])
  const [transmissions, setTransmissions] = useState([])
  const [filters, setFilters] = useState({ search: '', status: '', type: '', from: '', to: '' })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [nextConfig, nextSources, invoices, creditNotes, nextReadiness, nextCatalog, nextPayments] = await Promise.all([
        fiscalApi.config(), fiscalApi.sources(), fiscalApi.invoices(), fiscalApi.creditNotes(), fiscalApi.readiness(), fiscalApi.catalog(), fiscalApi.paymentMethods(),
      ])
      setConfig(nextConfig); setSources(nextSources); setDocuments([...invoices, ...creditNotes]); setReadiness(nextReadiness); setCatalog(nextCatalog); setPaymentMethods(nextPayments.items || [])
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const openDocument = useCallback(async (document) => {
    setSelected(document); setEvents([]); setTransmissions([])
    const type = document.documentType === 'CREDIT_NOTE' ? 'credit-notes' : 'invoices'
    const [nextEvents, nextTransmissions] = await Promise.all([fiscalApi.events(document.id, type), fiscalApi.transmissions(document.id, type)])
    setEvents(nextEvents); setTransmissions(nextTransmissions)
  }, [])

  async function refreshSelected() {
    if (!selected) return
    const type = selected.documentType === 'CREDIT_NOTE' ? 'credit-notes' : 'invoices'
    const document = await fiscalApi.getDocument(selected.id, type)
    setSelected(document); await openDocument(document); await load()
  }

  async function createInvoice(data) {
    setActionLoading(true); setError('')
    try {
      const document = await fiscalApi.createInvoice(data)
      setSelectedSource(null); setNotice('Borrador fiscal de prueba creado sin afectar la inscripción original.')
      await load(); await openDocument(document)
    } catch (err) { setError(err.message) } finally { setActionLoading(false) }
  }

  async function runStep(id, action, type) {
    setActionLoading(true); setError(''); setNotice('')
    try {
      const result = await fiscalApi.step(id, action, type)
      const document = result.document || result
      setNotice(action === 'process' ? 'Flujo de prueba ejecutado. La autorización mostrada es simulada.' : 'Paso de prueba ejecutado y auditado.')
      await load(); await openDocument(document)
    } catch (err) { setError(err.message) } finally { setActionLoading(false) }
  }

  async function createCreditNote(data) {
    if (!selected) return
    setActionLoading(true); setError('')
    try {
      const credit = await fiscalApi.createCreditNote(selected.id, data)
      setNotice('Nota de crédito de prueba creada; la factura original conserva su estado.')
      await load(); await openDocument(credit)
    } catch (err) { setError(err.message) } finally { setActionLoading(false) }
  }

  async function simulateDelivery(id, action, type) {
    setActionLoading(true); setError(''); setNotice('')
    try {
      await fiscalApi.simulateDelivery(id, action, type)
      setNotice(action === 'resend' ? 'Reenvío simulado y auditado; no se envió ningún correo.' : 'Envío simulado y auditado; no se envió ningún correo.')
      await refreshSelected()
    } catch (err) { setError(err.message) } finally { setActionLoading(false) }
  }

  const sortedDocuments = useMemo(() => [...documents].sort((a, b) => String(b.updatedAt || b.createdAt || b.issueDate).localeCompare(String(a.updatedAt || a.createdAt || a.issueDate))), [documents])
  const filtered = useMemo(() => sortedDocuments.filter((document) => {
    const search = filters.search.trim().toLowerCase()
    if (search && ![documentNumber(document), document.customer.legalName, document.customer.identification, document.accessKey, document.sourceId].some((value) => String(value || '').toLowerCase().includes(search))) return false
    if (filters.status && document.status !== filters.status) return false
    if (filters.type && document.documentType !== filters.type) return false
    if (filters.from && document.issueDate < filters.from) return false
    if (filters.to && document.issueDate > filters.to) return false
    return true
  }), [sortedDocuments, filters])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((Math.min(page, totalPages) - 1) * PAGE_SIZE, Math.min(page, totalPages) * PAGE_SIZE)
  const clearFilters = () => { setFilters({ search: '', status: '', type: '', from: '', to: '' }); setPage(1) }
  const setFilter = (key, value) => { setFilters((current) => ({ ...current, [key]: value })); setPage(1) }

  const stats = useMemo(() => ({
    drafts: documents.filter((item) => item.status === 'DRAFT').length,
    validation: documents.filter((item) => ['VALIDATION_FAILED', 'READY_TO_SIGN'].includes(item.status)).length,
    pending: documents.filter((item) => ['SIGNED', 'PENDING_SUBMISSION', 'SUBMITTED', 'RECEIVED', 'PROCESSING', 'RETRY_PENDING'].includes(item.status)).length,
    authorized: documents.filter((item) => item.status === 'AUTHORIZED').length,
    failed: documents.filter((item) => ['RETURNED', 'NOT_AUTHORIZED', 'ERROR'].includes(item.status)).length,
    total: documents.filter((item) => item.documentType === 'INVOICE' && item.status === 'AUTHORIZED').reduce((sum, item) => sum + Number(item.grandTotal), 0),
  }), [documents])
  const blockers = readiness?.officialBlockers || []

  return <div className="space-y-5">
    <FiscalBanner config={config} readiness={readiness} />
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="text-xl font-bold text-gray-900">Gestión de facturación electrónica</h1><p className="mt-1 text-sm text-gray-500">Documentos de prueba, catálogo fiscal, XML, RIDE y auditoría controlada.</p></div>
      <button className="btn-secondary justify-center" onClick={load} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualizar</button>
    </div>

    {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle size={18} className="mt-0.5 shrink-0" /><div><strong>No se completó la acción.</strong><p>{error}</p><p className="mt-1 text-xs">Verifica que el servicio fiscal de pruebas esté activo.</p></div></div>}
    {notice && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 size={18} /> {notice}</div>}

    <nav className="flex flex-wrap gap-2 border-b border-gray-200 pb-3" aria-label="Secciones de facturación">
      {[['panel', TrendingUp, 'Resumen'], ['documentos', Receipt, 'Documentos de prueba'], ['fuentes', UserRoundCheck, 'Inscripciones de prueba'], ['catalogo', BookOpenCheck, 'Catálogo fiscal'], ['config', Settings2, 'Configuración fiscal']].map(([key, Icon, label]) => <button key={key} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${tab === key ? 'bg-brand-700 text-white' : 'text-gray-600 hover:bg-gray-100'}`} onClick={() => setTab(key)}><Icon size={16} /> {label}</button>)}
    </nav>

    {loading && !config ? <div className="card flex min-h-56 items-center justify-center text-gray-500"><Loader2 className="mr-2 animate-spin" /> Cargando servicio fiscal de pruebas...</div> : <>
      {tab === 'panel' && <div className="space-y-4">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {[['Borradores', stats.drafts, 'bg-gray-50 text-gray-700'], ['Por validar', stats.validation, 'bg-blue-50 text-blue-800'], ['Pendientes', stats.pending, 'bg-amber-50 text-amber-800'], ['Autorizadas', stats.authorized, 'bg-emerald-50 text-emerald-800'], ['Con error', stats.failed, 'bg-red-50 text-red-800'], ['Total simulado', `$${stats.total.toFixed(2)}`, 'bg-brand-50 text-brand-900']].map(([label, value, style]) => <div key={label} className={`rounded-xl border border-white p-4 shadow-sm ${style}`}><p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
          <section className="card p-0 overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><h2 className="font-semibold">Documentos recientes</h2><p className="text-xs text-gray-500">Últimos cinco movimientos de prueba</p></div><button className="btn-secondary px-3" onClick={() => setTab('documentos')}>Ver todos</button></div><DocumentList documents={sortedDocuments.slice(0, 5)} onOpen={openDocument} emptyText="Aún no hay documentos. Crea una factura de prueba para comenzar." /></section>
          <div className="space-y-4">
            <section className="card"><div className="flex items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 font-semibold text-brand-900"><ShieldCheck size={18} /> Preparación fiscal</h2><p className="mt-1 text-xs text-gray-500">Estado previo a certificación y producción</p></div><span className={readiness?.ready ? 'badge-green' : 'badge-yellow'}>{readiness?.ready ? 'Listo' : 'Pendiente'}</span></div><div className="mt-4 rounded-lg bg-amber-50 p-3"><p className="text-sm font-semibold text-amber-900">{blockers.length} bloqueador(es) crítico(s)</p><ul className="mt-2 space-y-1 text-xs text-amber-800">{blockers.slice(0, 4).map((item) => <li key={item}>• {item}</li>)}</ul>{blockers.length > 4 && <p className="mt-2 text-xs text-amber-700">y {blockers.length - 4} pendiente(s) más</p>}</div><button className="btn-secondary mt-3 w-full justify-center" onClick={() => setTab('config')}>Revisar preparación</button></section>
            <section className="card"><h2 className="font-semibold text-brand-900">Acciones rápidas</h2><div className="mt-3 grid gap-2"><button className="btn-primary justify-center" onClick={() => setTab('fuentes')}><FilePlus2 size={16} /> Nueva factura de prueba</button><button className="btn-secondary justify-center" onClick={() => setTab('catalogo')}><BookOpenCheck size={16} /> Revisar catálogo</button><button className="btn-secondary justify-center" onClick={() => setTab('config')}><Settings2 size={16} /> Revisar configuración</button></div></section>
          </div>
        </div>

        <section className="card"><h2 className="font-semibold text-brand-900">Actividad reciente</h2>{sortedDocuments.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{sortedDocuments.slice(0, 3).map((document) => <button key={document.id} className="rounded-xl border p-3 text-left hover:bg-gray-50" onClick={() => openDocument(document)}><p className="text-xs text-gray-500">{document.issueDate} · {typeLabel(document.documentType)}</p><p className="mt-1 truncate text-sm font-semibold">{document.customer.legalName}</p><p className="mt-1 text-xs text-brand-700">{fiscalStatusLabel[document.status] || document.status}</p></button>)}</div> : <p className="mt-3 text-sm text-gray-500">La actividad aparecerá cuando se creen documentos de prueba.</p>}</section>
      </div>}

      {tab === 'documentos' && <div className="space-y-4">
        <section className="card">
          <div className="mb-4 flex items-center gap-2"><Filter size={17} className="text-brand-700" /><div><h2 className="font-semibold">Buscar y filtrar</h2><p className="text-xs text-gray-500">Consulta el historial completo de documentos de prueba.</p></div></div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(180px,1fr)_minmax(180px,1fr)]">
            <label><span className="label">Búsqueda</span><span className="relative block"><Search className="absolute left-3 top-2.5 text-gray-400" size={16} /><input className="input pl-9" placeholder="Cliente, número, clave o fuente" value={filters.search} onChange={(event) => setFilter('search', event.target.value)} /></span></label>
            <label><span className="label">Estado</span><select className="input" value={filters.status} onChange={(event) => setFilter('status', event.target.value)}><option value="">Todos los estados</option>{Object.entries(fiscalStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span className="label">Tipo</span><select className="input" value={filters.type} onChange={(event) => setFilter('type', event.target.value)}><option value="">Todos los tipos</option><option value="INVOICE">Factura</option><option value="CREDIT_NOTE">Nota de crédito</option></select></label>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(190px,220px)_minmax(190px,220px)_auto] sm:items-end">
            <label><span className="label">Emisión desde</span><input className="input" type="date" value={filters.from} onChange={(event) => setFilter('from', event.target.value)} /></label>
            <label><span className="label">Emisión hasta</span><input className="input" type="date" value={filters.to} onChange={(event) => setFilter('to', event.target.value)} /></label>
            <button className="btn-secondary justify-center sm:justify-self-start" type="button" onClick={clearFilters}><X size={16} /> Limpiar filtros</button>
          </div>
        </section>

        <section className="card p-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><h2 className="font-semibold">Documentos de prueba</h2><p className="text-xs text-gray-500">{filtered.length} resultado(s)</p></div><button className="btn-primary" onClick={() => setTab('fuentes')}><FilePlus2 size={16} /> Nueva factura de prueba</button></div>
          <DocumentList documents={paginated} onOpen={openDocument} emptyText="No existen documentos con estos filtros." />
          {filtered.length > PAGE_SIZE && <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm"><p className="text-gray-500">Página {Math.min(page, totalPages)} de {totalPages}</p><div className="flex gap-2"><button className="btn-secondary px-3" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={16} /> Anterior</button><button className="btn-secondary px-3" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Siguiente <ChevronRight size={16} /></button></div></div>}
        </section>
      </div>}

      {tab === 'fuentes' && <section className="space-y-4"><div><h2 className="text-lg font-semibold">Inscripciones de prueba</h2><p className="text-sm text-gray-500">Solo las verificadas y completas pueden originar un borrador. No se consulta Google Sheets.</p></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{sources.map((source) => { const eligible = source.paymentStatus === 'VERIFIED' && source.fiscalStatus === 'ELIGIBLE'; return <article key={source.id} className={`card border-l-4 ${eligible ? 'border-l-emerald-500' : 'border-l-gray-300'}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-brand-700">{source.id}</p><h3 className="mt-1 font-semibold">{source.participantName}</h3><p className="mt-1 text-sm text-gray-500">{source.serviceName}</p></div><strong>${source.amount}</strong></div><div className="mt-3 flex flex-wrap gap-2"><span className={source.paymentStatus === 'VERIFIED' ? 'badge-green' : 'badge-yellow'}>{source.paymentStatus === 'VERIFIED' ? 'Pago verificado' : 'Pago pendiente'}</span><span className={eligible ? 'badge-blue' : 'badge-gray'}>{eligible ? 'Elegible' : 'No elegible'}</span></div><p className="mt-3 min-h-8 text-xs text-gray-500">{source.issueNote}</p><button className="btn-primary mt-4 w-full justify-center" disabled={!eligible} onClick={() => setSelectedSource(source)}><FilePlus2 size={16} /> Crear borrador</button></article> })}</div></section>}

      {tab === 'catalogo' && <FiscalCatalogPanel catalog={catalog} />}
      {tab === 'config' && config && <FiscalConfigurationPanel config={config} readiness={readiness} />}
    </>}

    <InvoiceFormModal source={selectedSource} config={config} readiness={readiness} paymentMethods={paymentMethods} onClose={() => setSelectedSource(null)} onSubmit={createInvoice} loading={actionLoading} />
    <InvoiceDetailModal document={selected} events={events} transmissions={transmissions} readiness={readiness} loading={actionLoading} onClose={() => setSelected(null)} onStep={runStep} onRefresh={refreshSelected} onDownload={(id, kind, type) => fiscalApi.download(id, kind, type).catch((err) => setError(err.message))} onLoadXml={(id, type) => fiscalApi.xmlText(id, type).catch((err) => { setError(err.message); return '' })} onCreateCredit={createCreditNote} onSimulateDelivery={simulateDelivery} />
  </div>
}
