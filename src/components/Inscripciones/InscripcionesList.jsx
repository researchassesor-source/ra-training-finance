import { useEffect, useState, useCallback } from 'react'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { fmt, ESTADOS_CERTIFICADO, ESTADOS_PAGO_INS } from '../../utils/formatters'
import { exportInscripcionPDF, exportInscripcionesCSV, exportInscripcionesPDF } from '../../utils/exporters'
import Modal from '../UI/Modal'
import ConfirmDialog from '../UI/ConfirmDialog'
import Spinner from '../UI/Spinner'
import InscripcionesForm from './InscripcionesForm'
import { Plus, Pencil, Download, Award, CheckCircle, MessageCircle, Trash2, FileText } from 'lucide-react'

export default function InscripcionesList() {
  const { isAdmin, user } = useAuth()
  const [data, setData]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [modal, setModal]       = useState(null)
  const [selected, setSelected] = useState(null)
  const [confirm, setConfirm]   = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [filtros, setFiltros]   = useState({ estadoPago: '', estadoCertificado: '', servicio: '', desde: '', hasta: '' })
  const [waIns, setWaIns]       = useState(null)
  const [cuentas, setCuentas]   = useState([])
  const [waSelected, setWaSelected] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api.getInscripciones({ estadoPago: filtros.estadoPago, estadoCertificado: filtros.estadoCertificado })
      .then(r => setData(r.data || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [filtros.estadoPago, filtros.estadoCertificado])

  useEffect(() => { load() }, [load])

  // Apply client-side filters (servicio + dates)
  const filtered = data.filter(i => {
    if (filtros.servicio && i.ServicioNombre !== filtros.servicio) return false
    if (filtros.desde && i.FechaInicio && i.FechaInicio < filtros.desde) return false
    if (filtros.hasta && i.FechaInicio && i.FechaInicio > filtros.hasta) return false
    return true
  })

  const serviciosUnicos = [...new Set(data.map(i => i.ServicioNombre).filter(Boolean))].sort()

  function insToForm(ins, overrides = {}) {
    return {
      clienteNombre: ins.ClienteNombre, clienteID: ins.ClienteID,
      clienteEmail: ins.ClienteEmail, clienteTelefono: ins.ClienteTelefono,
      servicioId: ins.ServicioID, servicioNombre: ins.ServicioNombre,
      modalidad: ins.Modalidad, fechaInicio: ins.FechaInicio,
      monto: ins.Monto, metodoPago: ins.MetodoPago,
      razonSocial: ins.RazonSocial, ruc: ins.RUC,
      direccionFactura: ins.DireccionFactura,
      estadoPago: ins.EstadoPago, estadoCertificado: ins.EstadoCertificado,
      notas: ins.Notas,
      ...overrides,
    }
  }

  async function handleEmitirCertificado(ins) {
    try {
      await api.updateInscripcion(ins.ID, insToForm(ins, { estadoCertificado: 'emitido' }))
      load()
    } catch (e) { setError(e.message) }
  }

  async function handleVerificarPago(ins) {
    try {
      await api.updateInscripcion(ins.ID, insToForm(ins, { estadoPago: 'verificado' }))
      load()
    } catch (e) { setError(e.message) }
  }

  async function handleDelete() {
    setDeleting(true)
    try { await api.deleteInscripcion(confirm.ID); setConfirm(null); load() }
    catch (e) { setError(e.message) }
    finally { setDeleting(false) }
  }

  function openWhatsApp(ins) {
    setWaIns(ins)
    setWaSelected('')
    api.getConfigPagos()
      .then(r => setCuentas((r.data || []).filter(c => c.Activo === true || c.Activo === 'TRUE')))
      .catch(() => {})
  }

  function buildWaMessage(ins, cuenta) {
    const lineas = [
      `*R.A. Training — Datos de Pago*`, ``,
      `Estimado/a *${ins.ClienteNombre}*,`,
      `A continuación los datos para realizar el pago de su inscripción:`, ``,
      `📚 *Servicio:* ${ins.ServicioNombre}`,
      `💵 *Monto:* $${Number(ins.Monto).toFixed(2)} USD`, ``,
    ]
    if (cuenta) {
      lineas.push(`*${cuenta.Nombre}*`)
      lineas.push(cuenta.Detalles || '')
      if (cuenta.Instrucciones) { lineas.push(''); lineas.push(`ℹ️ ${cuenta.Instrucciones}`) }
    }
    lineas.push('', '¡Gracias por su preferencia! 🙏')
    return lineas.join('\n')
  }

  function buildExportLabel() {
    const parts = []
    if (filtros.servicio) parts.push(`Servicio: ${filtros.servicio}`)
    if (filtros.estadoPago) parts.push(`Pago: ${filtros.estadoPago}`)
    if (filtros.estadoCertificado) parts.push(`Cert: ${filtros.estadoCertificado}`)
    if (filtros.desde) parts.push(`Desde: ${filtros.desde}`)
    if (filtros.hasta) parts.push(`Hasta: ${filtros.hasta}`)
    return parts.join(' | ') || 'Todos los registros'
  }

  const totalMonto = filtered.reduce((s, i) => s + (Number(i.Monto) || 0), 0)
  const pendCert   = filtered.filter(i => i.EstadoCertificado === 'pendiente' && i.EstadoPago === 'verificado').length
  const emitidos   = filtered.filter(i => i.EstadoCertificado === 'emitido').length

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <select className="input w-auto text-sm" value={filtros.servicio}
            onChange={e => setFiltros(f => ({ ...f, servicio: e.target.value }))}>
            <option value="">Todos los cursos</option>
            {serviciosUnicos.map(s => <option key={s}>{s}</option>)}
          </select>
          <select className="input w-auto text-sm" value={filtros.estadoPago}
            onChange={e => setFiltros(f => ({ ...f, estadoPago: e.target.value }))}>
            <option value="">Todos los pagos</option>
            <option value="pendiente">Pendiente</option>
            <option value="pagado">Pagado</option>
            <option value="verificado">Verificado</option>
            <option value="cancelado">Cancelado</option>
          </select>
          <select className="input w-auto text-sm" value={filtros.estadoCertificado}
            onChange={e => setFiltros(f => ({ ...f, estadoCertificado: e.target.value }))}>
            <option value="">Todos los cert.</option>
            <option value="pendiente">Cert. pendiente</option>
            <option value="en_proceso">En proceso</option>
            <option value="emitido">Emitido</option>
          </select>
          <input className="input w-36 text-sm" type="date" placeholder="Desde" value={filtros.desde}
            onChange={e => setFiltros(f => ({ ...f, desde: e.target.value }))} />
          <input className="input w-36 text-sm" type="date" placeholder="Hasta" value={filtros.hasta}
            onChange={e => setFiltros(f => ({ ...f, hasta: e.target.value }))} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {isAdmin && (
            <>
              <button onClick={() => exportInscripcionesCSV(filtered)}
                className="btn-secondary text-sm" title="Exportar CSV para certificados">
                <Download size={15} /> CSV
              </button>
              <button onClick={() => exportInscripcionesPDF(filtered, buildExportLabel())}
                className="btn-secondary text-sm" title="Exportar PDF listado">
                <FileText size={15} /> PDF
              </button>
            </>
          )}
          <button onClick={() => { setSelected(null); setModal('new') }} className="btn-primary text-sm">
            <Plus size={15} /> Nueva Inscripción
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card py-3 text-center">
          <p className="text-xl font-bold text-gray-900">{filtered.length}</p>
          <p className="text-xs text-gray-500">Inscripciones</p>
        </div>
        <div className="card py-3 text-center">
          <p className="text-xl font-bold text-brand-700">{fmt.usd(totalMonto)}</p>
          <p className="text-xs text-gray-500">Total Recaudado</p>
        </div>
        <div className="card py-3 text-center">
          <p className="text-xl font-bold text-amber-600">{pendCert}</p>
          <p className="text-xs text-gray-500">Certificados por emitir</p>
        </div>
        <div className="card py-3 text-center">
          <p className="text-xl font-bold text-emerald-600">{emitidos}</p>
          <p className="text-xs text-gray-500">Certificados emitidos</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      {loading ? <Spinner text="Cargando inscripciones..." /> : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Fecha','Participante','Servicio','Modalidad','Monto','Pago','Certificado',''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-gray-400">Sin inscripciones registradas</td></tr>
                ) : filtered.map(i => (
                  <tr key={i.ID} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">{fmt.date(i.FechaCreacion)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{i.ClienteNombre}</p>
                      <p className="text-xs text-gray-400">{i.ClienteEmail}</p>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="truncate">{i.ServicioNombre}</p>
                      {i.FechaInicio && <p className="text-xs text-gray-400">Inicio: {fmt.date(i.FechaInicio)}</p>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{i.Modalidad}</td>
                    <td className="px-4 py-3 font-semibold text-brand-700 whitespace-nowrap">{fmt.usd(i.Monto)}</td>
                    <td className="px-4 py-3">
                      <span className={ESTADOS_PAGO_INS[i.EstadoPago]?.css || 'badge-gray'}>
                        {ESTADOS_PAGO_INS[i.EstadoPago]?.label || i.EstadoPago}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={ESTADOS_CERTIFICADO[i.EstadoCertificado]?.css || 'badge-gray'}>
                        {ESTADOS_CERTIFICADO[i.EstadoCertificado]?.label || i.EstadoCertificado}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openWhatsApp(i)} title="Enviar datos de pago"
                          className="p-1.5 hover:bg-emerald-50 rounded text-gray-400 hover:text-emerald-600 transition-colors">
                          <MessageCircle size={14} />
                        </button>
                        <button onClick={() => exportInscripcionPDF(i)} title="Descargar comprobante"
                          className="p-1.5 hover:bg-brand-50 rounded text-gray-400 hover:text-brand-600 transition-colors">
                          <Download size={14} />
                        </button>
                        <button onClick={() => { setSelected(i); setModal('edit') }}
                          className="p-1.5 hover:bg-brand-50 rounded text-gray-400 hover:text-brand-600 transition-colors">
                          <Pencil size={14} />
                        </button>
                        {isAdmin && i.EstadoPago !== 'verificado' && (
                          <button onClick={() => handleVerificarPago(i)} title="Verificar pago"
                            className="p-1.5 hover:bg-emerald-50 rounded text-gray-400 hover:text-emerald-600 transition-colors">
                            <CheckCircle size={14} />
                          </button>
                        )}
                        {isAdmin && i.EstadoPago === 'verificado' && i.EstadoCertificado !== 'emitido' && (
                          <button onClick={() => handleEmitirCertificado(i)} title="Emitir certificado"
                            className="p-1.5 hover:bg-amber-50 rounded text-gray-400 hover:text-amber-600 transition-colors">
                            <Award size={14} />
                          </button>
                        )}
                        {(isAdmin || i.EstadoPago === 'pendiente') && (
                          <button onClick={() => setConfirm(i)} title="Eliminar"
                            className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="bg-brand-50">
                    <td colSpan={4} className="px-4 py-2 text-sm font-semibold text-brand-800">TOTAL</td>
                    <td className="px-4 py-2 font-bold text-brand-700">{fmt.usd(totalMonto)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)}
        title={modal === 'edit' ? 'Editar Inscripción' : 'Nueva Inscripción'} size="lg">
        <InscripcionesForm
          initial={modal === 'edit' ? selected : null}
          onSave={() => { setModal(null); load() }}
          onCancel={() => setModal(null)}
        />
      </Modal>

      <ConfirmDialog
        open={!!confirm} onClose={() => setConfirm(null)} onConfirm={handleDelete}
        loading={deleting} title="Eliminar Inscripción"
        message={`¿Eliminar la inscripción de "${confirm?.ClienteNombre}" en "${confirm?.ServicioNombre}"? Esta acción no se puede deshacer.`}
      />

      <Modal open={!!waIns} onClose={() => setWaIns(null)} title="Enviar Datos de Pago por WhatsApp" size="md">
        {waIns && (
          <div className="space-y-4">
            <div className="text-sm text-gray-600">
              <p><span className="font-medium">Cliente:</span> {waIns.ClienteNombre}</p>
              <p><span className="font-medium">Teléfono:</span> {waIns.ClienteTelefono || 'No registrado'}</p>
              <p><span className="font-medium">Servicio:</span> {waIns.ServicioNombre}</p>
            </div>
            <div>
              <label className="label">Cuenta de pago a compartir</label>
              <select className="input" value={waSelected} onChange={e => setWaSelected(e.target.value)}>
                <option value="">Solo información del servicio</option>
                {cuentas.map(c => <option key={c.ID} value={c.ID}>{c.Nombre} ({c.Tipo})</option>)}
              </select>
            </div>
            <div>
              <label className="label">Vista previa</label>
              <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs whitespace-pre-wrap text-gray-700 max-h-48 overflow-y-auto">
                {buildWaMessage(waIns, cuentas.find(c => c.ID === waSelected))}
              </pre>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setWaIns(null)} className="btn-secondary flex-1">Cancelar</button>
              <button
                onClick={() => {
                  const msg   = buildWaMessage(waIns, cuentas.find(c => c.ID === waSelected))
                  const phone = waIns.ClienteTelefono?.replace(/\D/g, '') || ''
                  const url   = phone
                    ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
                    : `https://wa.me/?text=${encodeURIComponent(msg)}`
                  window.open(url, '_blank')
                }}
                className="btn-primary flex-1">
                <MessageCircle size={15} /> Abrir WhatsApp
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
