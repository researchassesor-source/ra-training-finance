import { useEffect, useState, useCallback } from 'react'
import { api } from '../../services/api'
import { fmt, ESTADOS_INGRESO, TIPOS_INGRESO } from '../../utils/formatters'
import { exportIngresosPDF } from '../../utils/exporters'
import Modal from '../UI/Modal'
import ConfirmDialog from '../UI/ConfirmDialog'
import Spinner from '../UI/Spinner'
import IngresosForm from './IngresosForm'
import { useAuth } from '../../context/AuthContext'
import { Plus, Pencil, Trash2, Download, CheckCircle, Eye, MessageCircle } from 'lucide-react'

export default function IngresosList({ soloMios = false }) {
  const [data, setData]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [modal, setModal]       = useState(null)
  const [selected, setSelected] = useState(null)
  const [confirm, setConfirm]   = useState(null)
  const [deleting, setDeleting] = useState(false)
  const { user, isAdmin, isVendedor } = useAuth()
  const [filtros, setFiltros]   = useState({ tipo: '', estado: '', desde: '', hasta: '' })
  const [detail, setDetail]     = useState(null)
  const [waIns, setWaIns]       = useState(null)
  const [cuentas, setCuentas]   = useState([])
  const [waSelected, setWaSelected] = useState('')
  const [waPhone, setWaPhone]   = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api.getIngresos(filtros)
      .then(r => setData(r.data || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [filtros])

  useEffect(() => { load() }, [load])

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.deleteIngreso(confirm.ID)
      setConfirm(null)
      load()
    } catch (e) { setError(e.message) }
    finally { setDeleting(false) }
  }

  function openWa(ing) {
    setWaIns(ing)
    setWaPhone(ing.ClienteTelefono || '')
    setWaSelected('')
    api.getConfigPagos()
      .then(r => setCuentas((r.data || []).filter(c => c.Activo === true || c.Activo === 'TRUE')))
      .catch(() => {})
  }

  function buildWaMessage(ing, cuenta) {
    const lineas = [
      `*R.A. Training — Datos de Pago*`,
      ``,
      `Estimado/a *${ing.Cliente || 'cliente'}*,`,
      `Le informamos que hemos registrado su pago por el siguiente concepto:`,
      ``,
      `📋 *Concepto:* ${ing.Concepto}`,
      `💵 *Monto:* $${Number(ing.Monto).toFixed(2)} USD`,
      `💳 *Método:* ${ing.MetodoPago}`,
      ``,
    ]
    if (cuenta) {
      lineas.push(`Para realizar su pago, puede utilizar los siguientes datos:`)
      lineas.push(`*${cuenta.Nombre}*`)
      lineas.push(cuenta.Detalles || '')
      if (cuenta.Instrucciones) { lineas.push(''); lineas.push(`ℹ️ ${cuenta.Instrucciones}`) }
    }
    lineas.push('', '¡Gracias por su preferencia! 🙏', 'R.A. Training')
    return lineas.join('\n')
  }

  const total       = data.reduce((s, i) => s + (Number(i.Monto) || 0), 0)
  const confirmados = data.filter(i => i.Estado === 'confirmado').length
  const pendientes  = data.filter(i => i.Estado === 'pendiente' || i.Estado === 'pendiente_verificacion').length

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <select className="input w-auto text-sm" value={filtros.tipo}
            onChange={e => setFiltros(f => ({ ...f, tipo: e.target.value }))}>
            <option value="">Todos los tipos</option>
            {TIPOS_INGRESO.map(t => <option key={t}>{t}</option>)}
          </select>
          <select className="input w-auto text-sm" value={filtros.estado}
            onChange={e => setFiltros(f => ({ ...f, estado: e.target.value }))}>
            <option value="">Todos los estados</option>
            <option value="confirmado">Confirmado</option>
            <option value="pendiente_verificacion">Por verificar</option>
            <option value="pendiente">Pendiente</option>
            <option value="cancelado">Cancelado</option>
          </select>
          <input className="input w-36 text-sm" type="date" value={filtros.desde}
            onChange={e => setFiltros(f => ({ ...f, desde: e.target.value }))} />
          <input className="input w-36 text-sm" type="date" value={filtros.hasta}
            onChange={e => setFiltros(f => ({ ...f, hasta: e.target.value }))} />
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportIngresosPDF(data)} className="btn-secondary text-sm">
            <Download size={15} /> PDF
          </button>
          {isVendedor && (
            <button onClick={() => { setSelected(null); setModal('new') }} className="btn-primary text-sm">
              <Plus size={15} /> {soloMios ? 'Reportar Ingreso' : 'Nuevo Ingreso'}
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Registros', val: data.length,        css: 'text-gray-900' },
          { label: 'Total Ingresos',  val: fmt.usd(total),     css: 'text-emerald-600 font-bold' },
          { label: 'Confirmados',     val: confirmados,         css: 'text-emerald-600' },
          { label: 'Por verificar',   val: pendientes,          css: 'text-amber-600' },
        ].map(s => (
          <div key={s.label} className="card py-3 text-center">
            <p className={`text-lg font-bold ${s.css}`}>{s.val}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      {/* Table */}
      {loading ? <Spinner text="Cargando ingresos..." /> : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Fecha','Tipo','Modalidad','Concepto','Cliente','Método','Estado',
                    ...(isAdmin ? ['Registrado por'] : []),'Monto',''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 10 : 9} className="text-center py-10 text-gray-400">
                      Sin ingresos registrados
                    </td>
                  </tr>
                ) : data.map(i => (
                  <tr key={i.ID} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">{fmt.date(i.Fecha)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{i.Tipo}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{i.Modalidad || '—'}</td>
                    <td className="px-4 py-3 max-w-xs truncate">{i.Concepto}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{i.Cliente || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{i.MetodoPago}</td>
                    <td className="px-4 py-3">
                      <span className={ESTADOS_INGRESO[i.Estado]?.css || 'badge-gray'}>
                        {ESTADOS_INGRESO[i.Estado]?.label || i.Estado}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">{i.CreadoPor || '—'}</td>
                    )}
                    <td className="px-4 py-3 font-semibold text-emerald-600 whitespace-nowrap">{fmt.usd(i.Monto)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {/* WhatsApp: visible para admin y vendedor dueño */}
                        {(isAdmin || i.CreadoPor === user?.username) && (
                          <button onClick={() => openWa(i)}
                            title="Enviar datos de pago por WhatsApp"
                            className="p-1.5 hover:bg-emerald-50 rounded text-gray-400 hover:text-emerald-600 transition-colors">
                            <MessageCircle size={14} />
                          </button>
                        )}
                        {/* Eye: solo admin, para ingresos pendientes de verificar */}
                        {isAdmin && i.Estado === 'pendiente_verificacion' && (
                          <button onClick={() => setDetail(i)}
                            title="Ver referencia del vendedor"
                            className="p-1.5 hover:bg-amber-50 rounded text-gray-400 hover:text-amber-600 transition-colors">
                            <Eye size={14} />
                          </button>
                        )}
                        {(isAdmin || i.CreadoPor === user?.username) && (
                          <button onClick={() => { setSelected(i); setModal('edit') }}
                            className="p-1.5 hover:bg-brand-50 rounded text-gray-400 hover:text-brand-600 transition-colors">
                            <Pencil size={14} />
                          </button>
                        )}
                        {isAdmin && (
                          <button onClick={() => setConfirm(i)}
                            className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {data.length > 0 && (
                <tfoot>
                  <tr className="bg-emerald-50">
                    <td colSpan={isAdmin ? 8 : 7} className="px-4 py-2 text-sm font-semibold text-emerald-800">TOTAL</td>
                    <td className="px-4 py-2 font-bold text-emerald-700">{fmt.usd(total)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Modal: nuevo / editar */}
      <Modal open={!!modal} onClose={() => setModal(null)}
        title={modal === 'edit' ? 'Editar Ingreso' : 'Nuevo Ingreso'} size="lg">
        <IngresosForm
          initial={modal === 'edit' ? selected : null}
          onSave={() => { setModal(null); load() }}
          onCancel={() => setModal(null)}
        />
      </Modal>

      {/* Confirm eliminar */}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Eliminar Ingreso"
        message={`¿Eliminar el ingreso "${confirm?.Concepto}"? Esta acción no se puede deshacer.`}
      />

      {/* Modal: ver referencia (admin, para pendiente_verificacion) */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Verificar Ingreso Pendiente" size="md">
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-gray-500">Registrado por</p><p className="font-medium">{detail.CreadoPor || '—'}</p></div>
              <div><p className="text-xs text-gray-500">Fecha</p><p className="font-medium">{fmt.date(detail.Fecha)}</p></div>
              <div><p className="text-xs text-gray-500">Tipo</p><p className="font-medium">{detail.Tipo}</p></div>
              <div><p className="text-xs text-gray-500">Monto</p><p className="font-semibold text-emerald-600">{fmt.usd(detail.Monto)}</p></div>
              <div className="col-span-2"><p className="text-xs text-gray-500">Concepto</p><p className="font-medium">{detail.Concepto}</p></div>
              <div><p className="text-xs text-gray-500">Cliente</p><p className="font-medium">{detail.Cliente || '—'}</p></div>
              <div><p className="text-xs text-gray-500">Método de Pago</p><p className="font-medium">{detail.MetodoPago}</p></div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-amber-700 mb-1">Referencia / Comprobante del vendedor:</p>
              <p className="text-sm text-amber-900 whitespace-pre-wrap">{detail.Notas || 'Sin referencia registrada'}</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setDetail(null)} className="btn-secondary flex-1">Cerrar</button>
              <button onClick={() => { setDetail(null); setSelected(detail); setModal('edit') }} className="btn-primary flex-1">
                <CheckCircle size={15} /> Verificar / Editar
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: enviar datos de pago por WhatsApp */}
      <Modal open={!!waIns} onClose={() => setWaIns(null)} title="Enviar Datos de Pago por WhatsApp" size="md">
        {waIns && (
          <div className="space-y-4">
            <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
              <p><span className="font-medium">Concepto:</span> {waIns.Concepto}</p>
              <p><span className="font-medium">Cliente:</span> {waIns.Cliente || 'No especificado'}</p>
              <p><span className="font-medium">Monto:</span> {fmt.usd(waIns.Monto)}</p>
            </div>
            <div>
              <label className="label">Número de WhatsApp del cliente</label>
              <input className="input" type="tel" value={waPhone} onChange={e => setWaPhone(e.target.value)}
                placeholder="+593 99 999 9999 (con código de país)" />
            </div>
            <div>
              <label className="label">Cuenta de pago a incluir</label>
              <select className="input" value={waSelected} onChange={e => setWaSelected(e.target.value)}>
                <option value="">Solo confirmación del pago</option>
                {cuentas.map(c => <option key={c.ID} value={c.ID}>{c.Nombre} ({c.Tipo})</option>)}
              </select>
            </div>
            <div>
              <label className="label">Vista previa</label>
              <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs whitespace-pre-wrap text-gray-700 max-h-44 overflow-y-auto">
                {buildWaMessage(waIns, cuentas.find(c => c.ID === waSelected))}
              </pre>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setWaIns(null)} className="btn-secondary flex-1">Cancelar</button>
              <button
                onClick={() => {
                  const msg = buildWaMessage(waIns, cuentas.find(c => c.ID === waSelected))
                  const phone = waPhone.replace(/\D/g, '')
                  const url = phone
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
