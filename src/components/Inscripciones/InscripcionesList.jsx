import { useCallback, useEffect, useMemo, useState } from 'react'
import { saveAs } from 'file-saver'
import {
  Award, Ban, CheckCircle, Download, FileText, History, MailCheck, MessageCircle,
  Pencil, Plus, QrCode, RefreshCw, ShoppingBag, Trash2,
} from 'lucide-react'
import { api } from '../../services/api'
import { certificatePublicUrlStatus } from '../../config/brand'
import { certificateAvalVisualStatus } from '../../config/certificate'
import {
  certificateArtifactStore,
  CertificatePdfRepository,
} from '../../services/certificateArtifactStore'
import { useAuth } from '../../context/AuthContext'
import { fmt, ESTADOS_CERTIFICADO, ESTADOS_PAGO_INS } from '../../utils/formatters'
import { exportInscripcionPDF, exportInscripcionesCSV, exportInscripcionesPDF } from '../../utils/exporters'
import { buildVerificationUrl, generateQrDataUrl } from '../../utils/qr'
import { buildCertificatePdf, validateCertificateData } from '../../utils/certificateGenerator'
import {
  canManageCertificates,
  certificateCapabilities,
  certificateLifecycleStatus,
  certificatePublicId,
  CERTIFICATE_DELETE_BLOCKED_MESSAGE,
  CERTIFICATE_PERMISSION_MESSAGE,
  isCertificateProtectedAgainstDeletion,
} from '../../utils/certificatePermissions'
import Modal from '../UI/Modal'
import ConfirmDialog from '../UI/ConfirmDialog'
import Spinner from '../UI/Spinner'
import InscripcionesForm from './InscripcionesForm'
import VentasVendedorModal from './VentasVendedorModal'
import EntregaCertificadoModal from './EntregaCertificadoModal'
import EnvioMasivoCertificadosModal from './EnvioMasivoCertificadosModal'
import AuditoriaCertificadosModal from './AuditoriaCertificadosModal'

const EMPTY_FILTERS = {
  servicioId: '', vendedor: '', estadoPago: '', estadoCertificado: '', tipoAval: '', desde: '', hasta: '',
}

const certificatePdfRepository = new CertificatePdfRepository({
  store: certificateArtifactStore,
  buildPdf: buildCertificatePdf,
})

export default function InscripcionesList() {
  const { isAdmin, user } = useAuth()
  const canManage = canManageCertificates(user)
  const qrConfiguration = useMemo(() => certificatePublicUrlStatus(), [])
  const [data, setData] = useState([])
  const [servicios, setServicios] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null)
  const [selected, setSelected] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [processing, setProcessing] = useState('')
  const [filtros, setFiltros] = useState(EMPTY_FILTERS)
  const [waIns, setWaIns] = useState(null)
  const [cuentas, setCuentas] = useState([])
  const [waSelected, setWaSelected] = useState('')
  const [qrIns, setQrIns] = useState(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [durationTarget, setDurationTarget] = useState(null)
  const [durationValue, setDurationValue] = useState('')
  const [durationSaving, setDurationSaving] = useState(false)
  const [durationError, setDurationError] = useState('')
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [lifecycle, setLifecycle] = useState(null)
  const [lifecycleReason, setLifecycleReason] = useState('')
  const [lifecycleConfirmed, setLifecycleConfirmed] = useState(false)
  const [lifecycleError, setLifecycleError] = useState('')
  const [lifecycleBusy, setLifecycleBusy] = useState(false)
  const [auditRetry, setAuditRetry] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    api.getInscripciones(filtros)
      .then(result => {
        const nextData = result.data || []
        setData(nextData)
        const visibleIds = new Set(nextData.map(item => item.ID))
        setSelectedIds(current => new Set([...current].filter(id => visibleIds.has(id))))
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [filtros])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    api.getServicios()
      .then(result => setServicios(result.data || []))
      .catch(() => {})
    if (isAdmin) {
      api.getUsuarios()
        .then(result => setVendedores((result.data || [])
          .filter(item => item.Rol === 'vendedor' || item.Rol === 'admin')
          .map(item => ({ username: item.Username, nombre: item.Nombre || item.Username }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))))
        .catch(() => {})
    } else if (user) {
      setVendedores([{ username: user.username, nombre: user.nombre || user.username }])
    }
  }, [isAdmin, user])

  const totals = useMemo(() => {
    const requiresAval = item => item.RequiereAvalExterno === true || item.RequiereAvalExterno === 'TRUE'
    return {
      sales: data.reduce((sum, item) => sum + (Number(item.Monto) || 0), 0),
      collected: data.filter(item => item.EstadoPago === 'verificado').reduce((sum, item) => sum + (Number(item.Monto) || 0), 0),
      raPending: data.filter(item => item.EstadoPago === 'verificado' && certificateLifecycleStatus(item) === 'pendiente' && !requiresAval(item)).length,
      avalPending: data.filter(item => requiresAval(item) && item.EstadoAval !== 'avalado').length,
      issued: data.filter(item => ['emitido', 'enviado', 'reemitido'].includes(certificateLifecycleStatus(item))).length,
    }
  }, [data])

  const selectableCertificates = useMemo(() => canManage ? data.filter(item => (
    certificateCapabilities(user, item).canDeliver && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(item.ClienteEmail || '').trim())
  )) : [], [canManage, data])
  const selectedCertificates = useMemo(() => canManage ? data.filter(item => selectedIds.has(item.ID)) : [], [canManage, data, selectedIds])
  const allSelectableSelected = selectableCertificates.length > 0
    && selectableCertificates.every(item => selectedIds.has(item.ID))

  function toggleCertificate(id) {
    setSelectedIds(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllCertificates() {
    setSelectedIds(current => {
      const next = new Set(current)
      if (allSelectableSelected) selectableCertificates.forEach(item => next.delete(item.ID))
      else selectableCertificates.forEach(item => next.add(item.ID))
      return next
    })
  }

  function setFilter(key, value) {
    setFiltros(current => ({ ...current, [key]: value }))
  }

  function openDurationEditor(item) {
    const service = servicios.find(candidate => item.ServicioID && String(candidate.ID) === String(item.ServicioID))
      || servicios.find(candidate => String(candidate.Nombre || '').trim().toLowerCase() === String(item.ServicioNombre || '').trim().toLowerCase())
    if (!service) {
      setError(`No se encontró el servicio "${item.ServicioNombre}" para completar su duración.`)
      return
    }
    setError('')
    setDurationError('')
    setDurationValue(String(service.Duracion || item.Duracion || ''))
    setDurationTarget({ item, service })
  }

  async function saveServiceDuration(e) {
    e.preventDefault()
    const value = durationValue.trim()
    if (!value) {
      setDurationError('Ingrese la duración académica del servicio.')
      return
    }
    const service = durationTarget?.service
    if (!service) return
    setDurationSaving(true)
    setDurationError('')
    try {
      await api.updateServicio(service.ID, {
        nombre: service.Nombre || '',
        tipo: service.Tipo || '',
        modalidad: service.Modalidad || 'N/A',
        precio: service.Precio ?? '',
        duracion: value,
        descripcion: service.Descripcion || '',
        activo: service.Activo === true || service.Activo === 'TRUE',
        fechaEvento: service.FechaEvento || '',
        fechaFinEvento: service.FechaFinEvento || '',
        lugarEvento: service.LugarEvento || '',
      })
      setServicios(current => current.map(candidate => candidate.ID === service.ID ? { ...candidate, Duracion: value } : candidate))
      setDurationTarget(null)
      setDurationValue('')
      load()
    } catch (err) {
      setDurationError(err.message)
    } finally {
      setDurationSaving(false)
    }
  }

  function buildExportLabel() {
    const seller = vendedores.find(item => item.username === filtros.vendedor)
    const course = servicios.find(item => item.ID === filtros.servicioId)
    const parts = [
      course && `Curso: ${course.Nombre}`,
      seller && `Vendedor: ${seller.nombre}`,
      filtros.estadoPago && `Pago: ${filtros.estadoPago}`,
      filtros.estadoCertificado && `Certificado: ${filtros.estadoCertificado}`,
      filtros.tipoAval && `Aval: ${filtros.tipoAval}`,
      filtros.desde && `Desde: ${filtros.desde}`,
      filtros.hasta && `Hasta: ${filtros.hasta}`,
    ].filter(Boolean)
    return parts.join(' | ') || 'Todos los registros'
  }

  async function handleConfirmedAction() {
    const action = confirm
    if (!action) return
    setProcessing(`${action.type}:${action.item.ID}`)
    setError('')
    try {
      if (action.type === 'delete') await api.deleteInscripcion(action.item.ID)
      if (action.type === 'verify') await api.verificarPagoInscripcion(action.item.ID)
      setConfirm(null)
      load()
    } catch (err) { setError(err.message) }
    finally { setProcessing('') }
  }

  function openLifecycle(type, item) {
    setLifecycle({ type, item })
    setLifecycleReason('')
    setLifecycleConfirmed(false)
    setLifecycleError('')
  }

  async function submitLifecycle(e) {
    e.preventDefault()
    const reason = lifecycleReason.trim()
    if (reason.length < 5) {
      setLifecycleError('Ingrese un motivo de al menos 5 caracteres.')
      return
    }
    if (!lifecycleConfirmed) {
      setLifecycleError('Debe confirmar explícitamente esta operación.')
      return
    }
    setLifecycleBusy(true)
    setLifecycleError('')
    try {
      if (lifecycle.type === 'void') await api.anularCertificado(lifecycle.item.ID, reason)
      else await api.reemitirCertificado(lifecycle.item.ID, reason)
      setLifecycle(null)
      load()
    } catch (err) {
      setLifecycleError(err.message)
    } finally {
      setLifecycleBusy(false)
    }
  }

  async function emitCertificate(item) {
    if (!canManage) {
      setError(CERTIFICATE_PERMISSION_MESSAGE)
      return
    }
    setProcessing(`certificate:${item.ID}`)
    setError('')
    setAuditRetry(null)
    try {
      const missing = validateCertificateData(item)
      if (missing.length) throw new Error(`Faltan los siguientes datos para generar el certificado: ${missing.join(', ')}.`)
      buildVerificationUrl(certificatePublicId(item))
      const avalVisual = certificateAvalVisualStatus(item)
      if (!avalVisual.valid) throw new Error(avalVisual.error)
      const result = await api.emitirCertificado(item.ID)
      const prepared = await certificatePdfRepository.prepare(result.data)
      await api.registrarArtefactoCertificado(item.ID, {
        pdfHash: prepared.hash,
        pdfStorageReference: prepared.reference,
        templateVersion: prepared.templateVersion,
        certificateVersion: prepared.certificateVersion,
      })
      const request = await api.solicitarDescargaCertificado(item.ID, {
        pdfHash: prepared.hash,
        pdfStorageReference: prepared.reference,
      })
      try {
        saveAs(prepared.blob, prepared.filename)
      } catch (deliveryError) {
        await api.confirmarDescargaCertificado(request.requestId, 'fallido', deliveryError.message)
        throw deliveryError
      }
      try {
        await api.confirmarDescargaCertificado(request.requestId, 'completado')
      } catch {
        setAuditRetry({ kind: 'confirm', requestId: request.requestId })
        const auditError = new Error('La descarga se inició, pero su confirmación de auditoría quedó pendiente. Use “Reintentar auditoría”.')
        auditError.deliveryStarted = true
        throw auditError
      }
      setSelected(result.data)
      load()
    } catch (err) {
      if (isAdmin && /duraci/i.test(err.message || '')) openDurationEditor(item)
      else {
        if (!err.deliveryStarted) setAuditRetry(current => current || { kind: 'emit', item })
        setError(err.message)
      }
    }
    finally { setProcessing('') }
  }

  async function downloadCertificate(item) {
    if (!canManage) {
      setError(CERTIFICATE_PERMISSION_MESSAGE)
      return
    }
    const previewWindow = window.open('', '_blank')
    if (previewWindow) {
      previewWindow.opener = null
      previewWindow.document.title = 'Generando certificado…'
      previewWindow.document.body.innerHTML = '<p style="font:16px system-ui;padding:24px;color:#114899">Generando vista previa del certificado…</p>'
    }
    setProcessing(`certificate:${item.ID}`)
    setError('')
    setAuditRetry(null)
    try {
      const current = await api.getCertificadoParaDescarga(item.ID)
      const result = await certificatePdfRepository.prepare(current.data)
      await api.registrarArtefactoCertificado(item.ID, {
        pdfHash: result.hash,
        pdfStorageReference: result.reference,
        templateVersion: result.templateVersion,
        certificateVersion: result.certificateVersion,
      })
      const request = await api.solicitarDescargaCertificado(item.ID, {
        pdfHash: result.hash,
        pdfStorageReference: result.reference,
      })
      const previewUrl = URL.createObjectURL(result.blob)
      try {
        saveAs(result.blob, result.filename)
        if (previewWindow) previewWindow.location.replace(previewUrl)
      } catch (deliveryError) {
        URL.revokeObjectURL(previewUrl)
        await api.confirmarDescargaCertificado(request.requestId, 'fallido', deliveryError.message)
        throw deliveryError
      }
      window.setTimeout(() => URL.revokeObjectURL(previewUrl), 60_000)
      try {
        await api.confirmarDescargaCertificado(request.requestId, 'completado')
      } catch {
        setAuditRetry({ kind: 'confirm', requestId: request.requestId })
        const auditError = new Error('La descarga se inició, pero su confirmación de auditoría quedó pendiente. Use “Reintentar auditoría”.')
        auditError.deliveryStarted = true
        throw auditError
      }
      load()
    } catch (err) {
      if (!err.deliveryStarted && previewWindow && !previewWindow.closed) previewWindow.close()
      if (isAdmin && /duraci/i.test(err.message || '')) openDurationEditor(item)
      else {
        if (!err.deliveryStarted) setAuditRetry(current => current || { kind: 'download', item })
        setError(err.message)
      }
    }
    finally { setProcessing('') }
  }

  async function retryCertificateAudit() {
    const retry = auditRetry
    if (!retry) return
    if (retry.kind === 'emit') {
      await emitCertificate(retry.item)
      return
    }
    if (retry.kind === 'download') {
      await downloadCertificate(retry.item)
      return
    }
    setProcessing('audit:retry')
    setError('')
    try {
      await api.confirmarDescargaCertificado(retry.requestId, 'completado')
      setAuditRetry(null)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setProcessing('')
    }
  }

  function showQr(item) {
    if (!canManage) {
      setError(CERTIFICATE_PERMISSION_MESSAGE)
      return
    }
    setQrIns(item)
    setQrDataUrl('')
    generateQrDataUrl(certificatePublicId(item))
      .then(setQrDataUrl)
      .catch(() => setError('No se pudo generar el código QR.'))
  }

  function openPaymentWhatsApp(item) {
    setWaIns(item)
    setWaSelected('')
    api.getConfigPagos()
      .then(result => setCuentas((result.data || []).filter(account => account.Activo === true || account.Activo === 'TRUE')))
      .catch(() => {})
  }

  function paymentMessage(item, account) {
    const lines = [
      '*R.A. Training — Datos de Pago*', '',
      `Estimado/a *${item.ClienteNombre}*,`,
      'A continuación los datos para realizar el pago de su inscripción:', '',
      `📚 *Servicio:* ${item.ServicioNombre}`,
      `💵 *Monto:* $${Number(item.Monto).toFixed(2)} USD`, '',
    ]
    if (account) {
      lines.push(`*${account.Nombre}*`, account.Detalles || '')
      if (account.Instrucciones) lines.push('', `ℹ️ ${account.Instrucciones}`)
    }
    lines.push('', '¡Gracias por su preferencia! 🙏')
    return lines.join('\n')
  }

  function isBusy(item, type) {
    return processing === `${type}:${item.ID}` || Boolean(processing && processing.endsWith(`:${item.ID}`))
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
          <select className="input w-full min-w-0 text-sm" value={filtros.servicioId} onChange={e => setFilter('servicioId', e.target.value)}>
            <option value="">Todos los cursos</option>
            {servicios.filter(item => item.Activo === true || item.Activo === 'TRUE').map(item => <option key={item.ID} value={item.ID}>{item.Nombre}</option>)}
          </select>
          {canManage && (
            <select className="input w-full min-w-0 text-sm" value={filtros.vendedor} onChange={e => setFilter('vendedor', e.target.value)}>
              <option value="">Todos los vendedores</option>
              {vendedores.map(item => <option key={item.username} value={item.username}>{item.nombre}</option>)}
            </select>
          )}
          <select className="input w-full min-w-0 text-sm" value={filtros.estadoPago} onChange={e => setFilter('estadoPago', e.target.value)}>
            <option value="">Todos los pagos</option>
            <option value="pendiente">Pendiente</option><option value="pagado">Pagado</option>
            <option value="verificado">Verificado</option><option value="cancelado">Cancelado</option>
          </select>
          <select className="input w-full min-w-0 text-sm" value={filtros.estadoCertificado} onChange={e => setFilter('estadoCertificado', e.target.value)}>
            <option value="">Todos los certificados</option>
            <option value="pendiente">Pendiente</option><option value="en_proceso">En proceso</option><option value="emitido">Emitido</option>
            <option value="anulado">Anulado</option><option value="reemitido">Reemitido</option>
          </select>
          <select className="input w-full min-w-0 text-sm" value={filtros.tipoAval} onChange={e => setFilter('tipoAval', e.target.value)}>
            <option value="">Todos los avales</option>
            <option value="sin_aval">Sin aval institucional</option>
            <option value="aval_pendiente">Con aval pendiente</option>
            <option value="avalado">Con aval completado</option>
          </select>
        </div>

        <div className="grid w-full grid-cols-1 gap-4 sm:w-fit sm:grid-cols-2 sm:gap-6">
          <label className="block text-xs text-gray-500">
            <span className="mb-1 block">Venta desde</span>
            <input className="input w-full text-sm sm:w-[220px]" type="date" value={filtros.desde} onChange={e => setFilter('desde', e.target.value)} />
          </label>
          <label className="block text-xs text-gray-500">
            <span className="mb-1 block">Venta hasta</span>
            <input className="input w-full text-sm sm:w-[220px]" type="date" value={filtros.hasta} onChange={e => setFilter('hasta', e.target.value)} />
          </label>
        </div>

        <div className="flex gap-2 flex-wrap">
          {isAdmin && (
            <>
              <button onClick={() => setModal('batch-delivery')} className="btn-primary text-sm"
                disabled={selectedCertificates.length === 0} title="Enviar por correo los certificados seleccionados">
                <MailCheck size={15} /> Enviar certificados ({selectedCertificates.length})
              </button>
              <button onClick={() => { setModal('sales'); setSelected(null) }} className="btn-secondary text-sm"><ShoppingBag size={15} /> Ventas por vendedor</button>
              <button onClick={() => exportInscripcionesCSV(data)} className="btn-secondary text-sm" disabled={!data.length}><Download size={15} /> CSV</button>
              <button onClick={() => exportInscripcionesPDF(data, buildExportLabel())} className="btn-secondary text-sm" disabled={!data.length}><FileText size={15} /> PDF</button>
              <button onClick={() => setModal('certificate-audit')} className="btn-secondary text-sm"><History size={15} /> Auditoría de certificados</button>
            </>
          )}
          <button onClick={() => { setSelected(null); setModal('new') }} className="btn-primary text-sm"><Plus size={15} /> Nueva Inscripción</button>
        </div>
        {isAdmin && (
          <div className={`rounded-lg border px-3 py-2 text-xs ${qrConfiguration.valid ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
            <span className="font-semibold">QR público · {qrConfiguration.environment} · {qrConfiguration.valid ? 'Configuración válida' : 'Emisión bloqueada'}</span>
            <span className="ml-2 break-all">{qrConfiguration.valid ? qrConfiguration.url : qrConfiguration.error}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Summary label="Inscripciones" value={data.length} color="text-gray-900" />
        <Summary label="Ventas registradas" value={fmt.usd(totals.sales)} color="text-brand-700" />
        <Summary label="Total recaudado" value={fmt.usd(totals.collected)} color="text-emerald-600" />
        <Summary label="Certificados R.A. por emitir" value={totals.raPending} color="text-amber-600" />
        <Summary label="Con aval pendientes" value={totals.avalPending} color="text-orange-600" />
        <Summary label="Certificados emitidos" value={totals.issued} color="text-emerald-600" />
      </div>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <p>{error}</p>
          {auditRetry && (
            <button type="button" className="btn-secondary text-xs" onClick={retryCertificateAudit} disabled={Boolean(processing)}>
              Reintentar auditoría
            </button>
          )}
        </div>
      )}

      {loading ? <Spinner text="Cargando inscripciones..." /> : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-xs">
              <colgroup>
                {isAdmin && <col className="w-[4%] xl:w-[3%]" />}
                <col className="w-[9%] xl:w-[7%]" />
                <col className={isAdmin ? 'w-[19%] xl:w-[15%]' : 'w-[21%] xl:w-[16%]'} />
                <col className="w-[20%] xl:w-[16%]" />
                <col className="hidden xl:table-column xl:w-[9%]" />
                <col className="hidden xl:table-column xl:w-[8%]" />
                <col className="hidden xl:table-column xl:w-[6%]" />
                <col className="hidden xl:table-column xl:w-[7%]" />
                <col className="hidden xl:table-column xl:w-[8%]" />
                <col className="hidden xl:table-column xl:w-[7%]" />
                <col className={isAdmin ? 'w-[19%] xl:hidden' : 'w-[20%] xl:hidden'} />
                <col className="w-[14%] xl:hidden" />
                <col className={isAdmin ? 'w-[15%] xl:w-[14%]' : 'w-[16%] xl:w-[15%]'} />
              </colgroup>
              <thead><tr className="bg-gray-50 border-b border-gray-100">
                {isAdmin && (
                  <th className="px-1 py-2.5 text-center">
                    <input type="checkbox" className="w-4 h-4 accent-brand-600" checked={allSelectableSelected}
                      onChange={toggleAllCertificates} disabled={selectableCertificates.length === 0}
                      aria-label="Seleccionar todos los certificados emitidos con correo válido" />
                  </th>
                )}
                <CompactHead lines={['Fecha', 'de venta']} />
                <CompactHead lines={['Participante']} />
                <CompactHead lines={['Servicio']} />
                <CompactHead lines={['Vendedor']} className="hidden xl:table-cell" />
                <CompactHead lines={['N.º', 'comprobante']} className="hidden xl:table-cell" />
                <CompactHead lines={['Monto']} className="hidden xl:table-cell" />
                <CompactHead lines={['Pago']} className="hidden xl:table-cell" />
                <CompactHead lines={['Certificado']} className="hidden xl:table-cell" />
                <CompactHead lines={['Aval']} className="hidden xl:table-cell" />
                <CompactHead lines={['Venta']} className="xl:hidden" />
                <CompactHead lines={['Estados']} className="xl:hidden" />
                <CompactHead lines={['Acciones']} align="center" />
              </tr></thead>
              <tbody>
                {!data.length ? <tr><td colSpan={isAdmin ? 13 : 12} className="text-center py-10 text-gray-400">Sin inscripciones registradas</td></tr> : data.map(item => {
                  const hasAval = item.RequiereAvalExterno === true || item.RequiereAvalExterno === 'TRUE'
                  const avalReady = !hasAval || item.EstadoAval === 'avalado'
                  const avalVisual = certificateAvalVisualStatus(item)
                  const issuanceConfigurationReady = avalReady && avalVisual.valid && qrConfiguration.valid
                  const capabilities = certificateCapabilities(user, item)
                  const canSelect = capabilities.canDeliver && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(item.ClienteEmail || '').trim())
                  const canVerifyPayment = ['pendiente', 'pagado', 'pendiente_verificacion'].includes(item.EstadoPago)
                  const rowBusy = isBusy(item, 'certificate')
                  return (
                    <tr key={item.ID} className="border-b border-gray-50 align-middle hover:bg-gray-50 transition-colors">
                      {isAdmin && (
                        <td className="px-1 py-2.5 text-center" title={canSelect ? 'Seleccionar para envío por correo' : 'Solo disponible para certificados emitidos con correo válido'}>
                          <input type="checkbox" className="w-4 h-4 accent-brand-600" checked={selectedIds.has(item.ID)}
                            onChange={() => toggleCertificate(item.ID)} disabled={!canSelect} aria-label={`Seleccionar certificado de ${item.ClienteNombre}`} />
                        </td>
                      )}
                      <td className="px-2 py-2.5 whitespace-nowrap text-[10px] leading-tight text-gray-500">
                        <p className="font-medium text-gray-600">{fmt.date(item.FechaCreacion)}</p>
                        <p className="mt-1 text-gray-400">{fmt.time(item.FechaCreacion)}</p>
                      </td>
                      <td className="px-2 py-2.5 min-w-0">
                        <p className="font-medium leading-tight text-gray-900 break-words" title={item.ClienteNombre}>{item.ClienteNombre}</p>
                        <p className="mt-1 truncate text-[10px] text-gray-400" title={item.ClienteEmail || 'Sin email'}>{item.ClienteEmail || 'Sin email'}</p>
                        {item.ClienteID && <p className="truncate text-[10px] text-gray-400" title={`ID: ${item.ClienteID}`}>ID: {item.ClienteID}</p>}
                      </td>
                      <td className="px-2 py-2.5 min-w-0">
                        <p className="leading-tight break-words" title={item.ServicioNombre}>{item.ServicioNombre}</p>
                        <p className="mt-1 text-[10px] leading-tight text-gray-400">
                          {item.Duracion || (isAdmin
                            ? <button type="button" onClick={() => openDurationEditor(item)} className="font-medium text-amber-600 hover:text-amber-700 hover:underline">Duración pendiente · Completar</button>
                            : 'Duración pendiente')}
                          <span className="block">{item.Modalidad}</span>
                        </p>
                        <p className="text-[10px] text-gray-400">{fmt.date(item.FechaInicio)} — {fmt.date(item.FechaFin)}</p>
                      </td>
                      <td className="hidden px-2 py-2.5 min-w-0 xl:table-cell"><p className="font-medium leading-tight break-words" title={item.VendedorNombre || item.CreadoPor || 'Sin vendedor'}>{item.VendedorNombre || item.CreadoPor || 'Sin vendedor'}</p>{item.VendedorUsername && <p className="mt-1 truncate text-[10px] text-gray-400">@{item.VendedorUsername}</p>}</td>
                      <td className="hidden px-2 py-2.5 min-w-0 font-mono text-[10px] xl:table-cell" title={item.NumeroComprobante || item.Notas || ''}><p className="truncate">{item.NumeroComprobante || item.Notas || '—'}</p>{item.FechaPago && <p className="font-sans text-[10px] leading-tight text-gray-400 mt-1"><span className="block">Pago</span>{fmt.date(item.FechaPago)}</p>}</td>
                      <td className="hidden px-2 py-2.5 font-semibold text-brand-700 whitespace-nowrap xl:table-cell">{fmt.usd(item.Monto)}</td>
                      <td className="hidden px-2 py-2.5 xl:table-cell"><PaymentBadge item={item} /></td>
                      <td className="hidden px-2 py-2.5 xl:table-cell">
                        {hasAval && !avalReady && item.EstadoCertificado !== 'emitido'
                          ? <span className="badge-yellow px-1.5 text-[10px] leading-tight" title="Pendiente del aval institucional">Pend. aval</span>
                          : <span title={canManage && item.CodigoCertificado ? `Código: ${item.CodigoCertificado}` : undefined} className={`${ESTADOS_CERTIFICADO[item.EstadoCertificado]?.css || 'badge-gray'} px-1.5 text-[10px] leading-tight`}>{ESTADOS_CERTIFICADO[item.EstadoCertificado]?.label || item.EstadoCertificado}</span>}
                      </td>
                      <td className="hidden px-2 py-2.5 min-w-0 xl:table-cell"><AvalBadge item={item} hasAval={hasAval} /></td>
                      <td className="px-2 py-2.5 min-w-0 xl:hidden">
                        <p className="truncate font-medium leading-tight text-gray-700" title={item.VendedorNombre || item.CreadoPor || 'Sin vendedor'}>{item.VendedorNombre || item.CreadoPor || 'Sin vendedor'}</p>
                        <p className="mt-1 font-semibold text-brand-700">{fmt.usd(item.Monto)}</p>
                        <p className="mt-1 truncate font-mono text-[10px] text-gray-400" title={item.NumeroComprobante || item.Notas || ''}>{item.NumeroComprobante || item.Notas || 'Sin comprobante'}</p>
                        {item.FechaPago && <p className="text-[10px] text-gray-400">{fmt.date(item.FechaPago)}</p>}
                        <div className="mt-1"><PaymentBadge item={item} /></div>
                      </td>
                      <td className="px-2 py-2.5 min-w-0 xl:hidden">
                        <div className="flex flex-col items-start gap-1">
                          {hasAval && !avalReady && item.EstadoCertificado !== 'emitido'
                            ? <span className="badge-yellow px-1.5 text-[10px] leading-tight" title="Pendiente del aval institucional">Pend. aval</span>
                            : <span title={canManage && item.CodigoCertificado ? `Código: ${item.CodigoCertificado}` : undefined} className={`${ESTADOS_CERTIFICADO[item.EstadoCertificado]?.css || 'badge-gray'} px-1.5 text-[10px] leading-tight`}>{ESTADOS_CERTIFICADO[item.EstadoCertificado]?.label || item.EstadoCertificado}</span>}
                          <AvalBadge item={item} hasAval={hasAval} />
                        </div>
                      </td>
                      <td className="px-2 py-2.5"><div className="mx-auto grid w-fit grid-cols-4 gap-1">
                        <Action icon={MessageCircle} label="Enviar datos de pago por WhatsApp" onClick={() => openPaymentWhatsApp(item)} disabled={rowBusy} css="hover:text-emerald-600 hover:bg-emerald-50" />
                        <Action icon={Download} label="Descargar comprobante de inscripción" onClick={() => exportInscripcionPDF(item)} disabled={rowBusy} />
                        <Action icon={Pencil} label="Editar inscripción" onClick={() => { setSelected(item); setModal('edit') }} disabled={rowBusy} />
                        {isAdmin && canVerifyPayment && <Action icon={CheckCircle} label="Verificar pago" onClick={() => setConfirm({ type: 'verify', item })} disabled={rowBusy} css="hover:text-emerald-600 hover:bg-emerald-50" />}
                        {capabilities.canIssue && <Action icon={Award}
                          label={!qrConfiguration.valid
                            ? qrConfiguration.error
                            : !avalReady
                              ? `Pendiente del aval institucional${item.InstitucionAval ? ` de ${item.InstitucionAval}` : ''}`
                              : !avalVisual.valid ? avalVisual.error : 'Generar y emitir certificado académico'}
                          onClick={() => emitCertificate(item)} disabled={rowBusy || !issuanceConfigurationReady} css="hover:text-amber-600 hover:bg-amber-50" />}
                        {capabilities.canDownload && <Action icon={Award} label="Ver y descargar certificado académico" onClick={() => downloadCertificate(item)} disabled={rowBusy} css="hover:text-amber-600 hover:bg-amber-50" />}
                        {capabilities.canViewQr && <Action icon={QrCode} label="Ver y descargar QR" onClick={() => showQr(item)} disabled={rowBusy} />}
                        {capabilities.canDeliver && <Action icon={MailCheck} label="Entregar certificado" onClick={() => { setSelected(item); setModal('delivery') }} disabled={rowBusy} css="hover:text-emerald-600 hover:bg-emerald-50" />}
                        {capabilities.canVoid && <Action icon={Ban} label="Anular certificado" onClick={() => openLifecycle('void', item)} disabled={rowBusy} css="hover:text-red-600 hover:bg-red-50" />}
                        {capabilities.canReissue && <Action icon={RefreshCw} label="Reemitir certificado" onClick={() => openLifecycle('reissue', item)} disabled={rowBusy} css="hover:text-blue-600 hover:bg-blue-50" />}
                        {(isAdmin || item.EstadoPago === 'pendiente') && (
                          isCertificateProtectedAgainstDeletion(item)
                            ? <Action icon={Trash2} label={CERTIFICATE_DELETE_BLOCKED_MESSAGE} disabled css="cursor-not-allowed text-gray-300" />
                            : <Action icon={Trash2} label="Eliminar inscripción" onClick={() => setConfirm({ type: 'delete', item })} disabled={rowBusy} css="hover:text-red-600 hover:bg-red-50" />
                        )}
                      </div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={modal === 'new' || modal === 'edit'} onClose={() => setModal(null)} title={modal === 'edit' ? 'Editar Inscripción' : 'Nueva Inscripción'} size="lg">
        <InscripcionesForm initial={modal === 'edit' ? selected : null} onSave={() => { setModal(null); load() }} onCancel={() => setModal(null)} />
      </Modal>
      <Modal open={modal === 'sales'} onClose={() => setModal(null)} title="Reporte de ventas por vendedor" size="xl"><VentasVendedorModal vendedores={vendedores} /></Modal>
      <Modal open={modal === 'delivery'} onClose={() => setModal(null)} title="Entregar certificado" size="lg">
        {selected && <EntregaCertificadoModal inscripcion={selected} isAdmin={isAdmin} onClose={() => setModal(null)} onUpdated={load} />}
      </Modal>
      <Modal open={modal === 'batch-delivery'} onClose={() => { setModal(null); setSelectedIds(new Set()) }} title="Enviar certificados por correo" size="lg">
        {modal === 'batch-delivery' && <EnvioMasivoCertificadosModal
          inscripciones={selectedCertificates}
          isAdmin={canManage}
          onClose={() => { setModal(null); setSelectedIds(new Set()) }}
          onUpdated={load}
        />}
      </Modal>
      <Modal open={modal === 'certificate-audit'} onClose={() => setModal(null)} title="Auditoría de certificados" size="xl">
        {modal === 'certificate-audit' && canManage && <AuditoriaCertificadosModal onClose={() => setModal(null)} />}
      </Modal>

      <Modal open={Boolean(lifecycle)} onClose={() => { if (!lifecycleBusy) setLifecycle(null) }}
        title={lifecycle?.type === 'void' ? 'Anular certificado' : 'Reemitir certificado'} size="sm">
        {lifecycle && (
          <form onSubmit={submitLifecycle} className="space-y-4">
            <div className={`rounded-lg border p-3 text-sm ${lifecycle.type === 'void' ? 'border-red-200 bg-red-50 text-red-900' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>
              <p className="font-semibold">{lifecycle.item.ClienteNombre}</p>
              <p>{lifecycle.item.ServicioNombre}</p>
              <p className="mt-1 font-mono text-xs">{lifecycle.item.CodigoCertificado}</p>
              <p className="mt-2 text-xs">
                {lifecycle.type === 'void'
                  ? 'El certificado seguirá existiendo y su QR mostrará CERTIFICADO ANULADO.'
                  : 'Se conservará el certificado anterior y se creará un identificador nuevo.'}
              </p>
            </div>
            <div>
              <label className="label" htmlFor="certificate-lifecycle-reason">Motivo obligatorio</label>
              <textarea id="certificate-lifecycle-reason" className="input min-h-24" required value={lifecycleReason}
                onChange={e => setLifecycleReason(e.target.value)} placeholder="Describa la razón institucional de esta operación" />
            </div>
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input type="checkbox" className="mt-1" checked={lifecycleConfirmed} onChange={e => setLifecycleConfirmed(e.target.checked)} />
              <span>Confirmo expresamente que deseo {lifecycle.type === 'void' ? 'anular' : 'reemitir'} este certificado y conservar su historial.</span>
            </label>
            {lifecycleError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{lifecycleError}</p>}
            <div className="flex gap-3">
              <button type="button" className="btn-secondary flex-1" disabled={lifecycleBusy} onClick={() => setLifecycle(null)}>Cancelar</button>
              <button type="submit" className="btn-primary flex-1" disabled={lifecycleBusy || !lifecycleConfirmed}>
                {lifecycleBusy ? 'Procesando...' : lifecycle.type === 'void' ? 'Anular' : 'Reemitir'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(durationTarget)} onClose={() => { if (!durationSaving) setDurationTarget(null) }} title="Completar duración académica" size="sm">
        {durationTarget && (
          <form onSubmit={saveServiceDuration} className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">{durationTarget.service.Nombre}</p>
              <p className="mt-1 text-xs">La duración se guardará en el servicio y se aplicará a todas sus inscripciones y certificados.</p>
            </div>
            <div>
              <label className="label" htmlFor="certificate-duration">Duración académica *</label>
              <input id="certificate-duration" className="input" required autoFocus value={durationValue} onChange={e => setDurationValue(e.target.value)} placeholder="Ej.: 40 o 40 horas" />
              <p className="mt-1 text-xs text-gray-400">Si escribe solo 40, el certificado mostrará “40 horas académicas”.</p>
            </div>
            {durationError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{durationError}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setDurationTarget(null)} className="btn-secondary flex-1" disabled={durationSaving}>Cancelar</button>
              <button type="submit" className="btn-primary flex-1" disabled={durationSaving}>{durationSaving ? 'Guardando...' : 'Guardar duración'}</button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog open={Boolean(confirm)} onClose={() => setConfirm(null)} onConfirm={handleConfirmedAction}
        loading={Boolean(processing)} title={confirm?.type === 'verify' ? 'Verificar pago' : 'Eliminar inscripción'}
        message={confirm?.type === 'verify'
          ? `¿Confirma que cotejó el pago de ${confirm?.item.ClienteNombre} y desea marcarlo como verificado?`
          : `¿Eliminar la inscripción de "${confirm?.item.ClienteNombre}" en "${confirm?.item.ServicioNombre}"? Esta acción no se puede deshacer.`} />

      <Modal open={Boolean(waIns)} onClose={() => setWaIns(null)} title="Enviar datos de pago por WhatsApp" size="md">
        {waIns && <div className="space-y-4">
          <div className="text-sm text-gray-600"><p><b>Participante:</b> {waIns.ClienteNombre}</p><p><b>Teléfono:</b> {waIns.ClienteTelefono || 'No registrado'}</p><p><b>Servicio:</b> {waIns.ServicioNombre}</p></div>
          <div><label className="label">Cuenta de pago a compartir</label><select className="input" value={waSelected} onChange={e => setWaSelected(e.target.value)}><option value="">Solo información del servicio</option>{cuentas.map(item => <option key={item.ID} value={item.ID}>{item.Nombre} ({item.Tipo})</option>)}</select></div>
          <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs whitespace-pre-wrap text-gray-700 max-h-48 overflow-y-auto">{paymentMessage(waIns, cuentas.find(item => item.ID === waSelected))}</pre>
          <div className="flex gap-3"><button onClick={() => setWaIns(null)} className="btn-secondary flex-1">Cancelar</button><button onClick={() => { const phone = String(waIns.ClienteTelefono || '').replace(/\D/g, ''); const url = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(paymentMessage(waIns, cuentas.find(item => item.ID === waSelected)))}` : `https://wa.me/?text=${encodeURIComponent(paymentMessage(waIns, cuentas.find(item => item.ID === waSelected)))}`; window.open(url, '_blank', 'noopener,noreferrer') }} className="btn-primary flex-1"><MessageCircle size={15} /> Abrir WhatsApp</button></div>
        </div>}
      </Modal>

      <Modal open={Boolean(qrIns)} onClose={() => setQrIns(null)} title="QR de verificación del certificado" size="sm">
        {qrIns && <div className="space-y-4 text-center"><p className="text-sm text-gray-600">Este QR independiente conserva la verificación histórica de esta versión.</p>{qrDataUrl ? <><img src={qrDataUrl} alt="QR de verificación" className="mx-auto rounded-lg border border-gray-200" width={220} height={220} /><p className="text-xs text-gray-400 break-all">{buildVerificationUrl(certificatePublicId(qrIns))}</p><a href={qrDataUrl} download={`qr_certificado_${certificatePublicId(qrIns)}.png`} className="btn-primary w-full justify-center"><Download size={15} /> Descargar PNG</a></> : <Spinner text="Generando QR..." />}</div>}
      </Modal>
    </div>
  )
}

function CompactHead({ lines, align = 'left', className = '' }) {
  return (
    <th className={`${className} px-2 py-2.5 ${align === 'center' ? 'text-center' : 'text-left'} text-[10px] font-semibold leading-tight text-gray-500 uppercase tracking-wide`}>
      {lines.map(line => <span key={line} className="block">{line}</span>)}
    </th>
  )
}

function PaymentBadge({ item }) {
  const status = ESTADOS_PAGO_INS[item.EstadoPago]
  return <span className={`${status?.css || 'badge-gray'} px-1.5 text-[10px] leading-tight`}>{status?.label || item.EstadoPago}</span>
}

function AvalBadge({ item, hasAval }) {
  if (!hasAval) return <span className="badge-gray px-1.5 text-[10px] leading-tight">Sin aval</span>
  return (
    <div className="min-w-0">
      <span className={`${item.EstadoAval === 'avalado' ? 'badge-green' : 'badge-yellow'} px-1.5 text-[10px] leading-tight`}>
        {item.EstadoAval === 'avalado' ? 'Avalado' : 'Pendiente'}
      </span>
      {item.InstitucionAval && <p className="mt-1 truncate text-[10px] text-gray-500" title={item.InstitucionAval}>{item.InstitucionAval}</p>}
    </div>
  )
}

function Summary({ label, value, color }) {
  return <div className="card py-3 text-center"><p className={`text-lg font-bold ${color}`}>{value}</p><p className="text-xs text-gray-500">{label}</p></div>
}

function Action({ icon: Icon, label, onClick, disabled, css = 'hover:text-brand-600 hover:bg-brand-50' }) {
  return <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label} className={`inline-flex h-6 w-6 items-center justify-center rounded text-gray-400 transition-colors disabled:opacity-40 ${css}`}><Icon size={13} /></button>
}
