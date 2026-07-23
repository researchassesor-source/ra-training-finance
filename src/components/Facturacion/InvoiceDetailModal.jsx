import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2, Circle, Clock3, Code2, Download, FileBadge, FileText, History,
  Loader2, Play, Receipt, RotateCcw, Send, ShieldAlert, XCircle,
} from 'lucide-react'
import Modal from '../UI/Modal'
import { fiscalStatusLabel, nextFiscalAction } from '../../utils/fiscalFeature'

const successfulStates = ['AUTHORIZED']
const failureStates = ['VALIDATION_FAILED', 'RETURNED', 'NOT_AUTHORIZED', 'ERROR']

function StatusBadge({ status }) {
  const style = successfulStates.includes(status) ? 'badge-green' : failureStates.includes(status) ? 'badge-red' : status === 'DRAFT' ? 'badge-gray' : 'badge-blue'
  return <span className={style}>{fiscalStatusLabel[status] || status}</span>
}

function FlowStepper({ document }) {
  const stages = [
    { label: 'Borrador', done: true },
    { label: 'Validación', done: Boolean(document.sequential), failed: document.status === 'VALIDATION_FAILED' },
    { label: 'XML', done: Boolean(document.xmlUnsignedPath) },
    { label: 'Firma mock', done: Boolean(document.xmlSignedPath) },
    { label: 'Recepción', done: ['RECEIVED', 'PROCESSING', 'AUTHORIZED'].includes(document.status) || Boolean(document.sriStatus) },
    { label: 'Autorización simulada', done: document.status === 'AUTHORIZED' },
    { label: 'RIDE', done: Boolean(document.ridePath) },
  ]
  return <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
    {stages.map((stage, index) => <li key={stage.label} className={`rounded-lg border p-2 text-xs ${stage.failed ? 'border-red-200 bg-red-50 text-red-800' : stage.done ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
      <span className="mb-1 flex items-center gap-1 font-semibold">{stage.failed ? <XCircle size={14} /> : stage.done ? <CheckCircle2 size={14} /> : <Circle size={14} />} {index + 1}</span>
      {stage.label}
    </li>)}
  </ol>
}

export default function InvoiceDetailModal({ document, events, transmissions, loading, onClose, onStep, onRefresh, onDownload, onLoadXml, onCreateCredit }) {
  const [tab, setTab] = useState('resumen')
  const [xml, setXml] = useState('')
  const [credit, setCredit] = useState({ reason: 'Devolución ficticia parcial', modifiedValue: '10.00', issueDate: '2026-07-23' })
  useEffect(() => { setTab('resumen'); setXml('') }, [document?.id])
  const action = nextFiscalAction(document)
  const typePath = document?.documentType === 'CREDIT_NOTE' ? 'credit-notes' : 'invoices'
  const number = document ? `${document.establishmentCode}-${document.emissionPointCode}-${document.sequential || 'PENDIENTE'}` : ''
  const groupedEvents = useMemo(() => [...events].reverse(), [events])

  async function openXml() {
    setTab('xml')
    if (!xml && document?.xmlUnsignedPath) setXml(await onLoadXml(document.id, typePath))
  }

  return <Modal open={Boolean(document)} onClose={onClose} title={document?.documentType === 'CREDIT_NOTE' ? 'Detalle de nota de crédito local' : 'Detalle de factura local'} size="xl">
    {document && <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{document.documentType === 'INVOICE' ? 'Factura ficticia' : 'Nota de crédito ficticia'}</p>
          <p className="mt-1 text-lg font-bold text-brand-900">{number}</p>
          <p className="mt-1 break-all font-mono text-[10px] text-gray-500">{document.accessKey || 'Clave pendiente'}</p>
        </div>
        <div className="flex items-center gap-2"><StatusBadge status={document.status} /><button className="btn-secondary px-3" onClick={onRefresh} title="Actualizar"><RotateCcw size={15} /></button></div>
      </div>

      <FlowStepper document={document} />

      <div className="flex flex-wrap gap-2 border-b pb-3 text-sm">
        {[['resumen', Receipt, 'Resumen'], ['eventos', History, 'Auditoría'], ['xml', Code2, 'XML'], ['archivos', FileText, 'Archivos']].map(([key, Icon, label]) =>
          <button key={key} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 font-medium ${tab === key ? 'bg-brand-700 text-white' : 'text-gray-600 hover:bg-gray-100'}`} onClick={key === 'xml' ? openXml : () => setTab(key)}><Icon size={16} /> {label}</button>)}
      </div>

      {tab === 'resumen' && <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[['Cliente', document.customer.legalName], ['Identificación', document.customer.identification], ['Emisión', document.issueDate], ['Total', `$${document.grandTotal}`]].map(([label, value]) =>
            <div key={label} className="rounded-xl border border-gray-200 p-3"><p className="text-xs text-gray-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-gray-900">{value}</p></div>)}
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <div className="hidden grid-cols-[90px_1fr_70px_90px_90px] gap-3 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 sm:grid"><span>Código</span><span>Descripción</span><span className="text-right">Cant.</span><span className="text-right">Precio</span><span className="text-right">Subtotal</span></div>
          {document.items.map((item) => <div key={item.id} className="grid gap-1 border-t px-4 py-3 text-sm first:border-t-0 sm:grid-cols-[90px_1fr_70px_90px_90px] sm:gap-3"><span className="font-mono text-xs text-gray-500">{item.mainCode}</span><span>{item.description}</span><span className="sm:text-right">{item.quantity}</span><span className="sm:text-right">${item.unitPrice}</span><span className="font-semibold sm:text-right">${item.subtotal}</span></div>)}
        </div>
        <div className="ml-auto grid max-w-md grid-cols-2 gap-2 rounded-xl bg-slate-50 p-4 text-sm">
          <span>Sin impuestos</span><strong className="text-right">${document.totalWithoutTaxes}</strong>
          <span>Descuento</span><strong className="text-right">${document.totalDiscount}</strong>
          <span>Impuestos</span><strong className="text-right">${document.totalTaxes}</strong>
          <span className="border-t pt-2 font-bold">TOTAL</span><strong className="border-t pt-2 text-right text-brand-800">${document.grandTotal}</strong>
        </div>

        {document.status === 'AUTHORIZED' && document.documentType === 'INVOICE' && !document.creditNoteReference && <form className="rounded-xl border border-amber-200 bg-amber-50 p-4" onSubmit={(event) => { event.preventDefault(); onCreateCredit(credit) }}>
          <p className="flex items-center gap-2 font-semibold text-amber-900"><FileBadge size={17} /> Crear nota de crédito ficticia</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_130px_150px_auto]">
            <input className="input" value={credit.reason} onChange={(event) => setCredit((value) => ({ ...value, reason: event.target.value }))} placeholder="Motivo" required />
            <input className="input" value={credit.modifiedValue} onChange={(event) => setCredit((value) => ({ ...value, modifiedValue: event.target.value }))} inputMode="decimal" required />
            <input className="input" type="date" value={credit.issueDate} onChange={(event) => setCredit((value) => ({ ...value, issueDate: event.target.value }))} required />
            <button className="btn-secondary justify-center" disabled={loading}>Crear</button>
          </div>
        </form>}
      </div>}

      {tab === 'eventos' && <div className="grid gap-4 lg:grid-cols-2">
        <section><h3 className="mb-3 text-sm font-bold text-brand-900">Eventos fiscales</h3><div className="space-y-2">{groupedEvents.length ? groupedEvents.map((event) => <div key={event.id} className="rounded-lg border border-gray-200 p-3 text-xs"><div className="flex items-start justify-between gap-2"><strong className="text-gray-800">{event.eventType}</strong><time className="text-gray-400">{new Date(event.occurredAt).toLocaleString()}</time></div><p className="mt-1 text-gray-500">{event.previousStatus || 'Inicio'} → {event.newStatus || event.previousStatus || 'Sin cambio de estado'}</p></div>) : <p className="text-sm text-gray-500">Sin eventos.</p>}</div></section>
        <section><h3 className="mb-3 text-sm font-bold text-brand-900">Transmisiones simuladas</h3><div className="space-y-2">{transmissions.length ? transmissions.map((item) => <div key={item.id} className="rounded-lg border border-gray-200 p-3 text-xs"><p className="font-semibold">{item.phase} · intento {item.attempt}</p><p className="mt-1 text-gray-500">{item.responseStatus}: {item.responseMessage}</p><p className="mt-1 break-all font-mono text-[10px] text-gray-400">SHA-256 {item.requestHash}</p></div>) : <p className="text-sm text-gray-500">Sin transmisiones.</p>}</div></section>
      </div>}

      {tab === 'xml' && <div>
        {!document.xmlUnsignedPath ? <div className="rounded-xl bg-gray-50 p-8 text-center text-sm text-gray-500">El XML aún no ha sido generado.</div> :
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 p-4 text-[11px] leading-relaxed text-emerald-200">{xml || 'Cargando XML local...'}</pre>}
      </div>}

      {tab === 'archivos' && <div className="grid gap-3 sm:grid-cols-2">
        <button className="btn-secondary justify-center py-4" disabled={!document.authorizedXmlPath} onClick={() => onDownload(document.id, 'xml', typePath)}><Download size={18} /> Descargar XML autorizado simulado</button>
        <button className="btn-secondary justify-center py-4" disabled={!document.ridePath} onClick={() => onDownload(document.id, 'ride', typePath)}><Download size={18} /> Descargar RIDE local</button>
        <div className="sm:col-span-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800"><p className="flex items-center gap-2 font-semibold"><ShieldAlert size={16} /> Estos archivos no tienen validez tributaria.</p></div>
      </div>}

      <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-xs text-gray-500"><Clock3 size={15} /> Cada transición queda registrada.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {action && <button className="btn-primary justify-center" disabled={loading} onClick={() => onStep(document.id, action.key, typePath)}>{loading ? <Loader2 className="animate-spin" size={17} /> : action.key === 'submit' ? <Send size={17} /> : <Play size={17} />} {loading ? 'Procesando...' : action.label}</button>}
          {!['AUTHORIZED', 'RETURNED', 'NOT_AUTHORIZED', 'ERROR'].includes(document.status) && <button className="btn-secondary justify-center" disabled={loading} onClick={() => onStep(document.id, 'process', typePath)}><Play size={17} /> Completar flujo local</button>}
        </div>
      </div>
    </div>}
  </Modal>
}
