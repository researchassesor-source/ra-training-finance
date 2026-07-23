import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle, CheckCircle2, FilePlus2, FileText, Filter, FlaskConical, Loader2,
  Receipt, RefreshCw, Search, Settings2, TrendingUp, UserRoundCheck,
} from 'lucide-react'
import { fiscalApi } from '../../services/fiscalApi'
import { fiscalStatusLabel } from '../../utils/fiscalFeature'
import FiscalBanner from './FiscalBanner'
import InvoiceFormModal from './InvoiceFormModal'
import InvoiceDetailModal from './InvoiceDetailModal'

const badge = (status) => status === 'AUTHORIZED' ? 'badge-green' : ['RETURNED', 'NOT_AUTHORIZED', 'ERROR', 'VALIDATION_FAILED'].includes(status) ? 'badge-red' : status === 'DRAFT' ? 'badge-gray' : 'badge-blue'
const typeLabel = (type) => type === 'INVOICE' ? 'Factura' : 'Nota de crédito'

export default function FacturacionView() {
  const [tab, setTab] = useState('panel')
  const [config, setConfig] = useState(null)
  const [sources, setSources] = useState([])
  const [documents, setDocuments] = useState([])
  const [selectedSource, setSelectedSource] = useState(null)
  const [selected, setSelected] = useState(null)
  const [events, setEvents] = useState([])
  const [transmissions, setTransmissions] = useState([])
  const [filters, setFilters] = useState({ search: '', status: '', type: '', from: '', to: '' })
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [nextConfig, nextSources, invoices, creditNotes] = await Promise.all([
        fiscalApi.config(), fiscalApi.sources(), fiscalApi.invoices(), fiscalApi.creditNotes(),
      ])
      setConfig(nextConfig); setSources(nextSources); setDocuments([...invoices, ...creditNotes])
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const openDocument = useCallback(async (document) => {
    setSelected(document); setEvents([]); setTransmissions([])
    const type = document.documentType === 'CREDIT_NOTE' ? 'credit-notes' : 'invoices'
    const [nextEvents, nextTransmissions] = await Promise.all([
      fiscalApi.events(document.id, type), fiscalApi.transmissions(document.id, type),
    ])
    setEvents(nextEvents); setTransmissions(nextTransmissions)
  }, [])

  async function refreshSelected() {
    if (!selected) return
    const type = selected.documentType === 'CREDIT_NOTE' ? 'credit-notes' : 'invoices'
    const document = await fiscalApi.getDocument(selected.id, type)
    setSelected(document)
    await openDocument(document)
    await load()
  }

  async function createInvoice(data) {
    setActionLoading(true); setError('')
    try {
      const document = await fiscalApi.createInvoice(data)
      setSelectedSource(null); setNotice('Borrador fiscal local creado sin afectar la inscripción original.')
      await load(); await openDocument(document)
    } catch (err) { setError(err.message) } finally { setActionLoading(false) }
  }

  async function runStep(id, action, type) {
    setActionLoading(true); setError(''); setNotice('')
    try {
      const result = await fiscalApi.step(id, action, type)
      const document = result.document || result
      setNotice(action === 'process' ? 'Flujo local ejecutado. La autorización mostrada es simulada.' : 'Paso local ejecutado y auditado.')
      await load(); await openDocument(document)
    } catch (err) { setError(err.message) } finally { setActionLoading(false) }
  }

  async function createCreditNote(data) {
    if (!selected) return
    setActionLoading(true); setError('')
    try {
      const credit = await fiscalApi.createCreditNote(selected.id, data)
      setNotice('Nota de crédito ficticia creada; la factura original conserva su estado.')
      await load(); await openDocument(credit)
    } catch (err) { setError(err.message) } finally { setActionLoading(false) }
  }

  const filtered = useMemo(() => documents.filter((document) => {
    const search = filters.search.trim().toLowerCase()
    const number = `${document.establishmentCode}-${document.emissionPointCode}-${document.sequential || ''}`
    if (search && ![number, document.customer.legalName, document.customer.identification, document.accessKey, document.sourceId].some((value) => String(value || '').toLowerCase().includes(search))) return false
    if (filters.status && document.status !== filters.status) return false
    if (filters.type && document.documentType !== filters.type) return false
    if (filters.from && document.issueDate < filters.from) return false
    if (filters.to && document.issueDate > filters.to) return false
    return true
  }), [documents, filters])

  const stats = useMemo(() => ({
    drafts: documents.filter((item) => item.status === 'DRAFT').length,
    validation: documents.filter((item) => ['VALIDATION_FAILED', 'READY_TO_SIGN'].includes(item.status)).length,
    pending: documents.filter((item) => ['SIGNED', 'PENDING_SUBMISSION', 'SUBMITTED', 'RECEIVED', 'PROCESSING', 'RETRY_PENDING'].includes(item.status)).length,
    authorized: documents.filter((item) => item.status === 'AUTHORIZED').length,
    failed: documents.filter((item) => ['RETURNED', 'NOT_AUTHORIZED', 'ERROR'].includes(item.status)).length,
    total: documents.filter((item) => item.documentType === 'INVOICE' && item.status === 'AUTHORIZED').reduce((sum, item) => sum + Number(item.grandTotal), 0),
  }), [documents])

  return <div className="space-y-5">
    <FiscalBanner />
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="text-xl font-bold text-gray-900">Facturación electrónica - prueba local</h1><p className="mt-1 text-sm text-gray-500">Factura, XML, simulador, RIDE y auditoría con datos ficticios.</p></div>
      <button className="btn-secondary justify-center" onClick={load} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualizar</button>
    </div>

    {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle size={18} className="mt-0.5 shrink-0" /><div><strong>No se completó la acción local.</strong><p>{error}</p><p className="mt-1 text-xs">Verifica que fiscal-service esté activo en 127.0.0.1:4010.</p></div></div>}
    {notice && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 size={18} /> {notice}</div>}

    <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
      {[['panel', TrendingUp, 'Panel'], ['documentos', Receipt, 'Documentos'], ['fuentes', UserRoundCheck, 'Inscripciones ficticias'], ['config', Settings2, 'Configuración local']].map(([key, Icon, label]) => <button key={key} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${tab === key ? 'bg-brand-700 text-white' : 'text-gray-600 hover:bg-gray-100'}`} onClick={() => setTab(key)}><Icon size={16} /> {label}</button>)}
    </div>

    {loading && !config ? <div className="card flex min-h-56 items-center justify-center text-gray-500"><Loader2 className="mr-2 animate-spin" /> Cargando servicio fiscal local...</div> : <>
      {(tab === 'panel' || tab === 'documentos') && <>
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {[['Borradores', stats.drafts, 'bg-gray-50 text-gray-700'], ['Por validar', stats.validation, 'bg-blue-50 text-blue-800'], ['Pendientes', stats.pending, 'bg-amber-50 text-amber-800'], ['Autorizadas', stats.authorized, 'bg-emerald-50 text-emerald-800'], ['Con error', stats.failed, 'bg-red-50 text-red-800'], ['Total simulado', `$${stats.total.toFixed(2)}`, 'bg-brand-50 text-brand-900']].map(([label, value, style]) => <div key={label} className={`rounded-xl border border-white p-4 shadow-sm ${style}`}><p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}
        </section>

        <section className="card">
          <div className="mb-4 flex items-center gap-2"><Filter size={17} className="text-brand-700" /><h2 className="font-semibold">Buscar y filtrar</h2></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="relative lg:col-span-2"><span className="sr-only">Buscar</span><Search className="absolute left-3 top-2.5 text-gray-400" size={16} /><input className="input pl-9" placeholder="Cliente, número, clave o fuente" value={filters.search} onChange={(e) => setFilters((value) => ({ ...value, search: e.target.value }))} /></label>
            <select className="input" aria-label="Estado" value={filters.status} onChange={(e) => setFilters((value) => ({ ...value, status: e.target.value }))}><option value="">Todos los estados</option>{Object.entries(fiscalStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select className="input" aria-label="Tipo" value={filters.type} onChange={(e) => setFilters((value) => ({ ...value, type: e.target.value }))}><option value="">Todos los tipos</option><option value="INVOICE">Factura</option><option value="CREDIT_NOTE">Nota de crédito</option></select>
            <div className="grid grid-cols-2 gap-2"><input className="input" aria-label="Fecha desde" type="date" value={filters.from} onChange={(e) => setFilters((value) => ({ ...value, from: e.target.value }))} /><input className="input" aria-label="Fecha hasta" type="date" value={filters.to} onChange={(e) => setFilters((value) => ({ ...value, to: e.target.value }))} /></div>
          </div>
        </section>

        <section className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4"><div><h2 className="font-semibold">Documentos locales</h2><p className="text-xs text-gray-500">{filtered.length} resultado(s)</p></div><button className="btn-primary" onClick={() => setTab('fuentes')}><FilePlus2 size={16} /> <span className="hidden sm:inline">Nueva desde inscripción</span></button></div>
          <div className="hidden border-t lg:block"><table className="w-full table-fixed text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="w-[13%] px-4 py-3">Fecha</th><th className="w-[14%] px-4 py-3">Tipo / número</th><th className="w-[24%] px-4 py-3">Cliente</th><th className="w-[18%] px-4 py-3">Estado</th><th className="w-[13%] px-4 py-3 text-right">Total</th><th className="w-[18%] px-4 py-3 text-right">Acción</th></tr></thead><tbody>{filtered.map((document) => <tr key={document.id} className="border-t hover:bg-gray-50"><td className="px-4 py-3">{document.issueDate}</td><td className="px-4 py-3"><p className="text-xs text-gray-500">{typeLabel(document.documentType)}</p><p className="font-mono text-xs">{document.establishmentCode}-{document.emissionPointCode}-{document.sequential || 'PENDIENTE'}</p></td><td className="px-4 py-3"><p className="truncate font-medium">{document.customer.legalName}</p><p className="truncate text-xs text-gray-500">{document.customer.identification}</p></td><td className="px-4 py-3"><span className={badge(document.status)}>{fiscalStatusLabel[document.status] || document.status}</span></td><td className="px-4 py-3 text-right font-semibold">${document.grandTotal}</td><td className="px-4 py-3 text-right"><button className="btn-secondary px-3" onClick={() => openDocument(document)}><FileText size={15} /> Ver detalle</button></td></tr>)}</tbody></table></div>
          <div className="divide-y border-t lg:hidden">{filtered.map((document) => <article key={document.id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs text-gray-500">{typeLabel(document.documentType)} · {document.issueDate}</p><p className="truncate font-semibold">{document.customer.legalName}</p><p className="mt-1 font-mono text-[11px] text-gray-500">{document.establishmentCode}-{document.emissionPointCode}-{document.sequential || 'PENDIENTE'}</p></div><strong>${document.grandTotal}</strong></div><div className="mt-3 flex items-center justify-between gap-2"><span className={badge(document.status)}>{fiscalStatusLabel[document.status] || document.status}</span><button className="btn-secondary px-3" onClick={() => openDocument(document)}>Ver</button></div></article>)}</div>
          {!filtered.length && <div className="border-t p-10 text-center text-sm text-gray-500">No existen documentos con estos filtros.</div>}
        </section>
      </>}

      {tab === 'fuentes' && <section className="space-y-4"><div><h2 className="text-lg font-semibold">Inscripciones ficticias</h2><p className="text-sm text-gray-500">Solo las verificadas y completas pueden originar un borrador. No se consulta Google Sheets.</p></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{sources.map((source) => { const eligible = source.paymentStatus === 'VERIFIED' && source.fiscalStatus === 'ELIGIBLE'; return <article key={source.id} className={`card border-l-4 ${eligible ? 'border-l-emerald-500' : 'border-l-gray-300'}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-brand-700">{source.id}</p><h3 className="mt-1 font-semibold">{source.participantName}</h3><p className="mt-1 text-sm text-gray-500">{source.serviceName}</p></div><strong>${source.amount}</strong></div><div className="mt-3 flex flex-wrap gap-2"><span className={source.paymentStatus === 'VERIFIED' ? 'badge-green' : 'badge-yellow'}>{source.paymentStatus === 'VERIFIED' ? 'Pago verificado' : 'Pago pendiente'}</span><span className={eligible ? 'badge-blue' : 'badge-gray'}>{eligible ? 'Elegible' : 'No elegible'}</span></div><p className="mt-3 min-h-8 text-xs text-gray-500">{source.issueNote}</p><button className="btn-primary mt-4 w-full justify-center" disabled={!eligible} onClick={() => setSelectedSource(source)}><FilePlus2 size={16} /> Crear borrador</button></article> })}</div></section>}

      {tab === 'config' && config && <section className="grid gap-4 lg:grid-cols-2"><div className="card"><h2 className="flex items-center gap-2 font-semibold"><FlaskConical size={18} className="text-orange-600" /> Emisor ficticio</h2><dl className="mt-4 grid grid-cols-[140px_1fr] gap-x-3 gap-y-3 text-sm"><dt className="text-gray-500">Razón social</dt><dd className="font-medium">{config.issuer.businessName}</dd><dt className="text-gray-500">RUC placeholder</dt><dd className="font-mono">{config.issuer.rucPlaceholder}</dd><dt className="text-gray-500">Dirección</dt><dd>{config.issuer.headOfficeAddress}</dd><dt className="text-gray-500">Ambiente</dt><dd>1 - prueba local ficticia</dd></dl></div><div className="card"><h2 className="font-semibold">Controles técnicos</h2><dl className="mt-4 grid grid-cols-[150px_1fr] gap-x-3 gap-y-3 text-sm"><dt className="text-gray-500">Almacenamiento</dt><dd>{config.storage}</dd><dt className="text-gray-500">Firma</dt><dd>{config.signer}</dd><dt className="text-gray-500">XSD</dt><dd>{config.xsd}</dd><dt className="text-gray-500">Conexión real</dt><dd className="font-semibold text-red-700">DESHABILITADA</dd></dl></div></section>}
    </>}

    <InvoiceFormModal source={selectedSource} onClose={() => setSelectedSource(null)} onSubmit={createInvoice} loading={actionLoading} />
    <InvoiceDetailModal document={selected} events={events} transmissions={transmissions} loading={actionLoading} onClose={() => setSelected(null)} onStep={runStep} onRefresh={refreshSelected} onDownload={(id, kind, type) => fiscalApi.download(id, kind, type).catch((err) => setError(err.message))} onLoadXml={(id, type) => fiscalApi.xmlText(id, type).catch((err) => { setError(err.message); return '' })} onCreateCredit={createCreditNote} />
  </div>
}
