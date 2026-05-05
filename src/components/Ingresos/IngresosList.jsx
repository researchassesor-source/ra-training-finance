import { useEffect, useState, useCallback } from 'react'
import { api } from '../../services/api'
import { fmt, ESTADOS_INGRESO, TIPOS_INGRESO } from '../../utils/formatters'
import { exportIngresosPDF } from '../../utils/exporters'
import Modal from '../UI/Modal'
import ConfirmDialog from '../UI/ConfirmDialog'
import Spinner from '../UI/Spinner'
import IngresosForm from './IngresosForm'
import { useAuth } from '../../context/AuthContext'
import { Plus, Pencil, Trash2, Download, CheckCircle, Eye } from 'lucide-react'

export default function IngresosList({ soloMios = false }) {
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [modal, setModal]     = useState(null) // null | 'new' | 'edit'
  const [selected, setSelected] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const { user, isAdmin, isVendedor } = useAuth()
  const [filtros, setFiltros] = useState({ tipo: '', estado: '', desde: '', hasta: '' })
  const [detail, setDetail] = useState(null)

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

  const total = data.reduce((s, i) => s + (Number(i.Monto) || 0), 0)

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <select className="input w-auto text-sm" value={filtros.tipo} onChange={e => setFiltros(f => ({ ...f, tipo: e.target.value }))}>
            <option value="">Todos los tipos</option>
            {TIPOS_INGRESO.map(t => <option key={t}>{t}</option>)}
          </select>
          <select className="input w-auto text-sm" value={filtros.estado} onChange={e => setFiltros(f => ({ ...f, estado: e.target.value }))}>
            <option value="">Todos los estados</option>
            <option value="confirmado">Confirmado</option>
            <option value="pendiente">Pendiente</option>
            <option value="cancelado">Cancelado</option>
          </select>
          <input className="input w-36 text-sm" type="date" value={filtros.desde}
            onChange={e => setFiltros(f => ({ ...f, desde: e.target.value }))} placeholder="Desde" />
          <input className="input w-36 text-sm" type="date" value={filtros.hasta}
            onChange={e => setFiltros(f => ({ ...f, hasta: e.target.value }))} placeholder="Hasta" />
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
          { label: 'Total Registros', val: data.length, css: 'text-gray-900' },
          { label: 'Total Ingresos', val: fmt.usd(total), css: 'text-emerald-600 font-bold' },
          { label: 'Confirmados', val: data.filter(i => i.Estado === 'confirmado').length, css: 'text-emerald-600' },
          { label: 'Pendientes',  val: data.filter(i => i.Estado === 'pendiente').length,  css: 'text-amber-600' },
        ].map(s => (
          <div key={s.label} className="card py-3 text-center">
            <p className={`text-lg font-bold ${s.css}`}>{s.val}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      {/* Table */}
      {loading ? <Spinner text="Cargando ingresos..." /> : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Fecha','Tipo','Modalidad','Concepto','Cliente','Método','Estado', ...(isAdmin ? ['Registrado por'] : []),'Monto',''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={isAdmin ? 10 : 9} className="text-center py-10 text-gray-400">Sin ingresos registrados</td></tr>
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
                    {isAdmin && <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">{i.CreadoPor || '—'}</td>}
                    <td className="px-4 py-3 font-semibold text-emerald-600 whitespace-nowrap">{fmt.usd(i.Monto)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {isAdmin && i.Estado === 'pendiente' && (
                          <button onClick={() => setDetail(i)}
                            title="Ver referencia de pago"
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

      <Modal open={!!modal} onClose={() => setModal(null)}
        title={modal === 'edit' ? 'Editar Ingreso' : 'Nuevo Ingreso'} size="lg">
        <IngresosForm
          initial={modal === 'edit' ? selected : null}
          onSave={() => { setModal(null); load() }}
          onCancel={() => setModal(null)}
        />
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Eliminar Ingreso"
        message={`¿Eliminar el ingreso "${confirm?.Concepto}"? Esta acción no se puede deshacer.`}
      />

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
    </div>
  )
}
