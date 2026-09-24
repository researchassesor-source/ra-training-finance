import { useEffect, useState, useCallback } from 'react'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { fmt } from '../../utils/formatters'
import { exportCertificadosAvalExcel, exportCertificadosAvalPDF } from '../../utils/exporters'
import { sha256Hex } from '../../services/certificateArtifactStore'
import { blobToBase64 } from '../../utils/blob'
import { saveAs } from 'file-saver'
import Modal from '../UI/Modal'
import Spinner from '../UI/Spinner'
import { ShieldCheck, Clock, ExternalLink, Download, FileText } from 'lucide-react'

const AVAL_TEMPLATE_VERSION = 'ra-itsal-security-2026-v1'

export default function CertificadosAvalView() {
  const { isAdmin } = useAuth()
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [filtros, setFiltros] = useState({ estadoAval: '', institucionAval: '', servicio: '', desde: '', hasta: '' })
  const [avalTarget, setAvalTarget] = useState(null)
  const [referencia, setReferencia] = useState('')
  const [valorAval, setValorAval]   = useState('')
  const [enlaceExterno, setEnlaceExterno] = useState('')
  const [codigoExterno, setCodigoExterno] = useState('')
  const [saving, setSaving]   = useState(false)
  const [busyId, setBusyId] = useState('')
  const [notice, setNotice] = useState('')
  const [deliveryTarget, setDeliveryTarget] = useState(null)
  const [deliveryEmail, setDeliveryEmail] = useState('')
  const [lifecycleTarget, setLifecycleTarget] = useState(null)
  const [lifecycleReason, setLifecycleReason] = useState('')
  const [lifecycleConfirmed, setLifecycleConfirmed] = useState(false)
  const [reconcileTarget, setReconcileTarget] = useState(null)
  const [reconcileResult, setReconcileResult] = useState('')
  const [reconcileReason, setReconcileReason] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api.getCertificadosAval(filtros.estadoAval ? { estadoAval: filtros.estadoAval } : {})
      .then(r => setData(r.data || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [filtros.estadoAval])

  useEffect(() => { load() }, [load])

  // Servicio + rango de fechas se filtran en el cliente sobre lo ya cargado,
  // igual que en InscripcionesList.
  const filtered = data.filter(i => {
    if (filtros.servicio && i.ServicioNombre !== filtros.servicio) return false
    if (filtros.institucionAval && i.InstitucionAval !== filtros.institucionAval) return false
    if (filtros.desde && i.FechaInicio && i.FechaInicio < filtros.desde) return false
    if (filtros.hasta && i.FechaInicio && i.FechaInicio > filtros.hasta) return false
    return true
  })

  const serviciosUnicos = [...new Set(data.map(i => i.ServicioNombre).filter(Boolean))].sort()
  const institucionesUnicas = [...new Set(data.map(i => i.InstitucionAval).filter(Boolean))].sort()

  function openAval(item) {
    setError('')
    setAvalTarget(item)
    setReferencia(item.AvalReferencia || '')
    setValorAval(item.ValorAval || '')
    setEnlaceExterno(item.AvalEnlaceExterno || '')
    setCodigoExterno(item.AvalCodigoExterno || '')
  }

  async function handleMarcarAval(e) {
    e.preventDefault()
    if (![referencia, enlaceExterno, codigoExterno].some(value => value.trim())) {
      setError('Ingrese al menos una referencia, un código externo o un enlace de validación.')
      return
    }
    setSaving(true)
    try {
      await api.marcarAval(avalTarget.ID, {
        avalReferencia: referencia,
        valorAval,
        avalEnlaceExterno: enlaceExterno,
        avalCodigoExterno: codigoExterno,
      })
      setAvalTarget(null)
      load()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  async function emitirAval(item) {
    setBusyId(item.ID)
    setError('')
    setNotice('')
    try {
      const issued = await api.emitirEntregableAval(item.ID)
      const certificate = issued.data
      if (certificate.TemplateVersion !== AVAL_TEMPLATE_VERSION) throw new Error('La plantilla oficial de ITSAL no coincide.')
      if (!certificate.PdfHash) {
        const signatures = (await api.getFirmasOficialesCertificado()).signatures
        const { buildCertificateV2Pdf } = await import('../../utils/certificateGeneratorV2')
        const prepared = await buildCertificateV2Pdf(certificate, { signatures })
        const pdfHash = await sha256Hex(prepared.blob)
        await api.guardarPdfEntregableAvalPrivado(item.ID, {
          pdfBase64: await blobToBase64(prepared.blob), pdfHash,
          templateVersion: AVAL_TEMPLATE_VERSION,
        })
        saveAs(prepared.blob, prepared.filename)
      } else {
        const archived = await api.leerPdfEntregableAvalPrivado(item.ID)
        const bytes = Uint8Array.from(atob(archived.contentBase64), ch => ch.charCodeAt(0))
        const blob = new Blob([bytes], { type: 'application/pdf' })
        if (await sha256Hex(blob) !== archived.hash) throw new Error('El PDF archivado no coincide con su huella SHA-256.')
        saveAs(blob, archived.filename)
      }
      setNotice('Certificado avalado archivado y descargado. El envío al participante sigue siendo una acción separada.')
      load()
    } catch (err) {
      setError(`${err.message} Si la emisión quedó registrada, use este mismo botón para reintentar sin crear otro código.`)
      load()
    } finally { setBusyId('') }
  }

  async function enviarAval(e) {
    e.preventDefault()
    if (!deliveryTarget) return
    setBusyId(deliveryTarget.ID)
    setError('')
    setNotice('')
    try {
      const result = await api.enviarEntregableAvalEmail(deliveryTarget.ID, deliveryEmail.trim())
      setNotice(result.alreadySent ? 'Este certificado ya había sido enviado; no se duplicó el correo.' : 'Certificado avalado enviado con el PDF oficial archivado.')
      setDeliveryTarget(null)
      load()
    } catch (err) { setError(err.message) }
    finally { setBusyId('') }
  }

  async function changeAvalLifecycle(e) {
    e.preventDefault()
    if (!lifecycleTarget || !lifecycleConfirmed || lifecycleReason.trim().length < 5) return
    const { item, action } = lifecycleTarget
    setBusyId(item.ID)
    setError('')
    setNotice('')
    try {
      if (action === 'void') {
        await api.anularEntregableAval(item.ID, lifecycleReason.trim())
        setNotice('Certificado ITSAL anulado. El QR conservará la versión anterior como no vigente.')
      } else {
        await api.reemitirEntregableAval(item.ID, lifecycleReason.trim())
        setLifecycleTarget(null)
        setBusyId('')
        await emitirAval(item)
        return
      }
      setLifecycleTarget(null)
      load()
    } catch (err) { setError(err.message); load() }
    finally { setBusyId('') }
  }

  async function reconcileAvalDelivery(e) {
    e.preventDefault()
    if (!reconcileTarget || !reconcileResult || reconcileReason.trim().length < 5) return
    setBusyId(reconcileTarget.ID)
    setError('')
    try {
      await api.resolverEnvioEntregableAval(reconcileTarget.ID, reconcileResult, reconcileReason.trim())
      setNotice(reconcileResult === 'enviado' ? 'El envío quedó registrado como confirmado tras revisión.' : 'El envío se devolvió a pendiente tras confirmar que no salió ningún correo.')
      setReconcileTarget(null)
      load()
    } catch (err) { setError(err.message) }
    finally { setBusyId('') }
  }

  const pendientes   = filtered.filter(i => i.EstadoAval !== 'avalado').length
  const avalados     = filtered.filter(i => i.EstadoAval === 'avalado').length
  const totalAPagar  = filtered.reduce((s, i) => s + (Number(i.ValorAval) || 0), 0)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Certificados con aval institucional</h2>
        <p className="text-sm text-gray-500">
          {isAdmin ? 'Control de certificados que dependen de una institución avaladora.' : 'Solo se muestran los certificados asignados a su institución.'}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <select className="input w-auto text-sm" value={filtros.estadoAval}
            onChange={e => setFiltros(f => ({ ...f, estadoAval: e.target.value }))}>
            <option value="">Todos (aval generado o no)</option>
            <option value="pendiente">Aval no generado</option>
            <option value="avalado">Aval generado</option>
          </select>
          {isAdmin && (
            <select className="input w-auto text-sm" value={filtros.institucionAval}
              onChange={e => setFiltros(f => ({ ...f, institucionAval: e.target.value }))}>
              <option value="">Todas las instituciones</option>
              {institucionesUnicas.map(nombre => <option key={nombre}>{nombre}</option>)}
            </select>
          )}
          <select className="input w-auto text-sm" value={filtros.servicio}
            onChange={e => setFiltros(f => ({ ...f, servicio: e.target.value }))}>
            <option value="">Todos los cursos</option>
            {serviciosUnicos.map(s => <option key={s}>{s}</option>)}
          </select>
          <input className="input w-36 text-sm" type="date" placeholder="Desde" value={filtros.desde}
            onChange={e => setFiltros(f => ({ ...f, desde: e.target.value }))} />
          <input className="input w-36 text-sm" type="date" placeholder="Hasta" value={filtros.hasta}
            onChange={e => setFiltros(f => ({ ...f, hasta: e.target.value }))} />
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportCertificadosAvalExcel(filtered)} className="btn-secondary text-sm" disabled={filtered.length === 0}>
            <Download size={15} /> Excel
          </button>
          <button onClick={() => exportCertificadosAvalPDF(filtered, filtros.estadoAval ? `Filtro: ${filtros.estadoAval}` : '')} className="btn-secondary text-sm" disabled={filtered.length === 0}>
            <FileText size={15} /> PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card py-3 text-center">
          <p className="text-xl font-bold text-gray-900">{filtered.length}</p>
          <p className="text-xs text-gray-500">Total</p>
        </div>
        <div className="card py-3 text-center">
          <p className="text-xl font-bold text-amber-600">{pendientes}</p>
          <p className="text-xs text-gray-500">Pendientes</p>
        </div>
        <div className="card py-3 text-center">
          <p className="text-xl font-bold text-emerald-600">{avalados}</p>
          <p className="text-xs text-gray-500">Avalados</p>
        </div>
        <div className="card py-3 text-center">
          <p className="text-xl font-bold text-brand-700">{fmt.usd(totalAPagar)}</p>
          <p className="text-xs text-gray-500">Total a pagar (aval)</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
      {notice && <p className="text-sm text-emerald-800 bg-emerald-50 rounded-lg p-3">{notice}</p>}

      {loading ? <Spinner text="Cargando certificados..." /> : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Fecha Curso','Participante','Servicio','Institución','Modalidad','Horas','Estado de Aval','Referencia','Valor Aval', ...(isAdmin ? ['Certificado ITSAL'] : []), ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={isAdmin ? 11 : 10} className="text-center py-10 text-gray-400">Sin certificados con aval externo</td></tr>
                ) : filtered.map(i => (
                  <tr key={i.ID} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                      {fmt.date(i.FechaInicio)}{i.FechaFin ? ` — ${fmt.date(i.FechaFin)}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{i.ClienteNombre}</p>
                      {i.ClienteID && <p className="text-xs text-gray-400">CI: {i.ClienteID}</p>}
                      {i.ClienteEmail && <p className="text-xs text-gray-400">{i.ClienteEmail}</p>}
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate">{i.ServicioNombre}</td>
                    <td className="px-4 py-3 max-w-[180px] truncate" title={i.InstitucionAval || ''}>{i.InstitucionAval || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{i.Modalidad}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">{i.Duracion || '—'}</td>
                    <td className="px-4 py-3">
                      {i.EstadoAval === 'avalado' ? (
                        <span className="badge-green inline-flex items-center gap-1"><ShieldCheck size={12} /> Avalado</span>
                      ) : (
                        <span className="badge-yellow inline-flex items-center gap-1"><Clock size={12} /> Pendiente</span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[200px] truncate text-xs">
                      {i.AvalEnlaceExterno ? (
                        <a href={i.AvalEnlaceExterno} target="_blank" rel="noopener noreferrer"
                            className="text-brand-600 hover:underline flex items-center gap-1">
                            Ver enlace <ExternalLink size={11} />
                        </a>
                      ) : i.AvalReferencia ? <span className="font-mono text-gray-600">{i.AvalReferencia}</span> : '—'}
                      {i.AvalCodigoExterno && <p className="font-mono text-[10px] text-gray-400 mt-1">{i.AvalCodigoExterno}</p>}
                    </td>
                    <td className="px-4 py-3 font-semibold text-brand-700 whitespace-nowrap">
                      {i.EstadoAval === 'avalado' ? fmt.usd(i.ValorAval) : '—'}
                    </td>
                    {isAdmin && <td className="px-4 py-3 min-w-[210px]">
                      {i.EntregableAval?.CertificateStatus === 'anulado' ? (
                        <p className="text-xs text-red-700 font-medium mb-2">Anulado · versión {i.EntregableAval.CertificateVersion}</p>
                      ) : i.EntregableAval?.PdfHash ? (
                        <p className="text-xs text-emerald-700 font-medium mb-2">PDF oficial archivado · {i.EntregableAval.CodigoCertificado}</p>
                      ) : <p className="text-xs text-gray-500 mb-2">
                        {i.EstadoAval === 'avalado' ? 'Pendiente de emisión y archivo' : 'Esperando confirmación ITSAL'}
                      </p>}
                      {i.EstadoAval === 'avalado' && i.EntregableAval?.CertificateStatus !== 'anulado' && /itsal|san\s+luis/i.test(i.InstitucionAval || '') && <div className="flex flex-wrap gap-1.5">
                        <button type="button" disabled={busyId === i.ID || !i.AvalCodigoExterno}
                          onClick={() => emitirAval(i)} className="btn-secondary text-xs px-2 py-1">
                          <Download size={13} /> {i.EntregableAval?.PdfHash ? 'Descargar' : 'Emitir y descargar'}
                        </button>
                        {i.EntregableAval?.PdfHash && !['enviando', 'requiere_revision'].includes(i.EntregableAval.EstadoEntregaFinal) && <button type="button" disabled={busyId === i.ID || i.EntregableAval.EstadoEntregaFinal === 'enviado'}
                          onClick={() => { setDeliveryTarget(i); setDeliveryEmail(i.ClienteEmail || '') }} className="btn-primary text-xs px-2 py-1">
                          {i.EntregableAval.EstadoEntregaFinal === 'enviado' ? 'Enviado' : 'Enviar por correo'}
                        </button>}
                        {i.EntregableAval?.PdfHash && ['enviando', 'requiere_revision'].includes(i.EntregableAval.EstadoEntregaFinal) &&
                          <button type="button" disabled={busyId === i.ID}
                            onClick={() => { setReconcileTarget(i); setReconcileResult(''); setReconcileReason('') }}
                            className="btn-secondary text-xs px-2 py-1 text-amber-800">Revisar envío</button>}
                        {i.EntregableAval?.PdfHash && <button type="button" disabled={busyId === i.ID}
                          onClick={() => { setLifecycleTarget({ item: i, action: 'reissue' }); setLifecycleReason(''); setLifecycleConfirmed(false) }}
                          className="btn-secondary text-xs px-2 py-1">Corregir versión</button>}
                        {i.EntregableAval?.PdfHash && <button type="button" disabled={busyId === i.ID}
                          onClick={() => { setLifecycleTarget({ item: i, action: 'void' }); setLifecycleReason(''); setLifecycleConfirmed(false) }}
                          className="btn-secondary text-xs px-2 py-1 text-red-700">Anular</button>}
                      </div>}
                    </td>}
                    <td className="px-4 py-3">
                      <button onClick={() => openAval(i)} className="btn-primary text-xs px-3 py-1.5">
                        {i.EstadoAval === 'avalado' ? 'Editar aval' : 'Marcar avalado'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={!!avalTarget} onClose={() => setAvalTarget(null)} title="Registrar aval institucional" size="sm">
        {avalTarget && (
          <form onSubmit={handleMarcarAval} className="space-y-4">
            <p className="text-sm text-gray-600">
              Confirmando el aval externo para <span className="font-medium">{avalTarget.ClienteNombre}</span> — {avalTarget.ServicioNombre}
            </p>
            <div>
              <label className="label">Referencia del aval</label>
              <input className="input" value={referencia} onChange={e => setReferencia(e.target.value)}
                placeholder="Ej.: AVAL-2026-0031" />
            </div>
            <div>
              <label className="label">Valor del aval (USD)</label>
              <input className="input" type="number" step="0.01" min="0" value={valorAval}
                onChange={e => setValorAval(e.target.value)} placeholder="0.00" />
              <p className="text-xs text-gray-400 mt-1">Costo de este aval, para el pago de la factura correspondiente.</p>
            </div>
            <div>
              <label className="label">Enlace de validación externo</label>
              <input className="input" type="url" value={enlaceExterno} onChange={e => setEnlaceExterno(e.target.value)}
                placeholder="https://institucion.example/verificar/..." />
              <p className="text-xs text-gray-500 mt-1">Se mostrará como direccionamiento externo. No se generará un segundo QR.</p>
            </div>
            <div>
              <label className="label">Código externo / Ministerio</label>
              <input className="input" maxLength={64} value={codigoExterno} onChange={e => setCodigoExterno(e.target.value)}
                placeholder="Código emitido por la institución" />
              <p className="text-xs text-gray-500 mt-1">Debe registrar al menos una referencia, código o enlace para confirmar el aval.</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setAvalTarget(null)} className="btn-secondary flex-1">Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">
                {saving ? 'Guardando...' : 'Confirmar Aval'}
              </button>
            </div>
          </form>
        )}
      </Modal>
      <Modal open={!!deliveryTarget} onClose={() => setDeliveryTarget(null)} title="Enviar certificado avalado" size="sm">
        {deliveryTarget && <form className="space-y-4" onSubmit={enviarAval}>
          <p className="text-sm text-gray-600">Se enviará únicamente el PDF oficial archivado de <strong>{deliveryTarget.ClienteNombre}</strong>, con el código ITSAL <strong>{deliveryTarget.AvalCodigoExterno}</strong>.</p>
          <div><label className="label" htmlFor="aval-delivery-email">Correo del participante</label>
            <input id="aval-delivery-email" className="input" type="email" required value={deliveryEmail} onChange={e => setDeliveryEmail(e.target.value)} /></div>
          <div className="flex gap-3"><button type="button" className="btn-secondary flex-1" onClick={() => setDeliveryTarget(null)}>Cancelar</button>
            <button type="submit" disabled={!!busyId} className="btn-primary flex-1">{busyId ? 'Enviando…' : 'Confirmar envío'}</button></div>
        </form>}
      </Modal>
      <Modal open={!!lifecycleTarget} onClose={() => setLifecycleTarget(null)}
        title={lifecycleTarget?.action === 'void' ? 'Anular certificado ITSAL' : 'Crear nueva versión ITSAL'} size="sm">
        {lifecycleTarget && <form className="space-y-4" onSubmit={changeAvalLifecycle}>
          <p className="text-sm text-gray-600">{lifecycleTarget.action === 'void'
            ? 'El QR conservará la versión como anulada. El PDF histórico no se borra.'
            : 'Se conservará el PDF anterior y se creará un nuevo código y versión. El código ITSAL confirmado no se altera.'}</p>
          <div><label htmlFor="aval-lifecycle-reason" className="label">Motivo documentado</label>
            <textarea id="aval-lifecycle-reason" className="input" required minLength={5} value={lifecycleReason}
              onChange={e => setLifecycleReason(e.target.value)} /></div>
          <label className="flex items-start gap-2 text-sm text-gray-700"><input type="checkbox" checked={lifecycleConfirmed}
            onChange={e => setLifecycleConfirmed(e.target.checked)} /> Confirmo esta acción administrativa y su registro en auditoría.</label>
          <div className="flex gap-3"><button type="button" className="btn-secondary flex-1" onClick={() => setLifecycleTarget(null)}>Cancelar</button>
            <button type="submit" disabled={!lifecycleConfirmed || lifecycleReason.trim().length < 5 || !!busyId}
              className="btn-primary flex-1">{busyId ? 'Procesando…' : lifecycleTarget.action === 'void' ? 'Anular' : 'Crear nueva versión'}</button></div>
        </form>}
      </Modal>
      <Modal open={!!reconcileTarget} onClose={() => setReconcileTarget(null)} title="Revisar envío incierto" size="sm">
        {reconcileTarget && <form className="space-y-4" onSubmit={reconcileAvalDelivery}>
          <p className="text-sm text-amber-800 bg-amber-50 rounded-lg p-3">Antes de elegir, compruebe el correo saliente de la cuenta emisora. No pulse «Enviar» nuevamente sin esta revisión.</p>
          <div><label className="label" htmlFor="aval-reconcile-result">Resultado comprobado</label>
            <select id="aval-reconcile-result" className="input" required value={reconcileResult} onChange={e => setReconcileResult(e.target.value)}>
              <option value="">Seleccione…</option><option value="enviado">El correo sí salió</option>
              <option value="no_enviado">Confirmé que no salió</option>
            </select></div>
          <div><label className="label" htmlFor="aval-reconcile-reason">Observación de la revisión</label>
            <textarea id="aval-reconcile-reason" className="input" required minLength={5} value={reconcileReason}
              onChange={e => setReconcileReason(e.target.value)} /></div>
          <div className="flex gap-3"><button type="button" className="btn-secondary flex-1" onClick={() => setReconcileTarget(null)}>Cancelar</button>
            <button type="submit" disabled={!reconcileResult || reconcileReason.trim().length < 5 || !!busyId}
              className="btn-primary flex-1">{busyId ? 'Guardando…' : 'Registrar revisión'}</button></div>
        </form>}
      </Modal>
    </div>
  )
}
