import { useEffect, useState, useCallback } from 'react'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { fmt, ESTADOS_EGRESO } from '../../utils/formatters'
import { exportEgresosPDF } from '../../utils/exporters'
import Modal from '../UI/Modal'
import ConfirmDialog from '../UI/ConfirmDialog'
import TableSkeleton from '../UI/TableSkeleton'
import EgresosForm from './EgresosForm'
import { Plus, Pencil, Trash2, CheckCircle, XCircle, Download, CreditCard } from 'lucide-react'
import PagosForm from '../Pagos/PagosForm'

export default function EgresosList({ soloMios = false }) {
  const { isAdmin } = useAuth()
  const [data, setData]         = useState([])
  const [cats, setCats]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [modal, setModal]       = useState(null)
  const [selected, setSelected] = useState(null)
  const [confirm, setConfirm]   = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [filtros, setFiltros]   = useState({ categoria: '', estado: '', desde: '', hasta: '' })
  const [payModal, setPayModal] = useState(false)
  const [payTarget, setPayTarget] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    api.getEgresos(filtros)
      .then(r => setData(r.data || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [filtros])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    api.getCategorias()
      .then(r => setCats((r.data || []).filter(c => c.Tipo === 'egreso')))
      .catch(() => {})
  }, [])

  async function handleApprove(egreso, estado) {
    try {
      await api.updateEgreso(egreso.ID, {
        fecha: egreso.Fecha,
        categoria: egreso.Categoria,
        concepto: egreso.Concepto,
        proveedor: egreso.Proveedor,
        monto: egreso.Monto,
        estado,
        notas: egreso.Notas,
      })
      load()
    } catch (e) { setError(e.message) }
  }

  async function handleDelete() {
    setDeleting(true)
    try { await api.deleteEgreso(confirm.ID); setConfirm(null); load() }
    catch (e) { setError(e.message) }
    finally { setDeleting(false) }
  }

  const total = data.reduce((s, e) => s + (Number(e.Monto) || 0), 0)

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <select className="input w-auto text-sm" value={filtros.categoria}
            onChange={e => setFiltros(f => ({ ...f, categoria: e.target.value }))}>
            <option value="">Todas las categorías</option>
            {cats.map(c => <option key={c.ID}>{c.Nombre}</option>)}
          </select>
          <select className="input w-auto text-sm" value={filtros.estado}
            onChange={e => setFiltros(f => ({ ...f, estado: e.target.value }))}>
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="aprobado">Aprobado</option>
            <option value="rechazado">Rechazado</option>
            <option value="pagado">Pagado</option>
          </select>
          <input className="input w-36 text-sm" type="date" value={filtros.desde}
            onChange={e => setFiltros(f => ({ ...f, desde: e.target.value }))} />
          <input className="input w-36 text-sm" type="date" value={filtros.hasta}
            onChange={e => setFiltros(f => ({ ...f, hasta: e.target.value }))} />
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button onClick={() => exportEgresosPDF(data)} className="btn-secondary text-sm">
              <Download size={15} /> PDF
            </button>
          )}
          <button onClick={() => { setSelected(null); setModal('new') }} className="btn-primary text-sm">
            <Plus size={15} /> {isAdmin ? 'Nuevo Egreso' : 'Reportar Gasto'}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total',     val: fmt.usd(total),                                              css: 'text-red-600 font-bold' },
          { label: 'Pendientes', val: data.filter(e => e.Estado === 'pendiente').length + ' gastos', css: 'text-amber-600' },
          { label: 'Aprobados', val: fmt.usd(data.filter(e => e.Estado === 'aprobado').reduce((s,e) => s+(Number(e.Monto)||0),0)), css: 'text-emerald-600' },
          { label: 'Pagados',   val: data.filter(e => e.Estado === 'pagado').length + ' gastos',   css: 'text-brand-600' },
        ].map(s => (
          <div key={s.label} className="card py-3 text-center">
            <p className={`text-base font-bold ${s.css}`}>{s.val}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      {loading ? <TableSkeleton cols={isAdmin ? 8 : 7} rows={6} /> : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Fecha','Categoría','Concepto','Proveedor','Estado','Registrado por','Aprobado por','Monto','Acciones'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-10 text-gray-400">Sin egresos registrados</td></tr>
                ) : data.map(e => (
                  <tr key={e.ID} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">{fmt.date(e.Fecha)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{e.Categoria}</td>
                    <td className="px-4 py-3 max-w-xs truncate">{e.Concepto}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{e.Proveedor || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={ESTADOS_EGRESO[e.Estado]?.css || 'badge-gray'}>
                        {ESTADOS_EGRESO[e.Estado]?.label || e.Estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">{e.CreadoPor || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">{e.AprobadoPor || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-red-600 whitespace-nowrap">{fmt.usd(e.Monto)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {isAdmin && e.Estado === 'pendiente' && <>
                          <button onClick={() => handleApprove(e, 'aprobado')}
                            title="Aprobar" className="p-1.5 hover:bg-emerald-50 rounded text-gray-400 hover:text-emerald-600 transition-colors">
                            <CheckCircle size={14} />
                          </button>
                          <button onClick={() => handleApprove(e, 'rechazado')}
                            title="Rechazar" className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600 transition-colors">
                            <XCircle size={14} />
                          </button>
                        </>}
                        {isAdmin && (
                          <button onClick={() => { setSelected(e); setModal('edit') }}
                            className="p-1.5 hover:bg-brand-50 rounded text-gray-400 hover:text-brand-600 transition-colors">
                            <Pencil size={14} />
                          </button>
                        )}
                        {isAdmin && e.Estado === 'aprobado' && (
                          <button onClick={() => { setPayTarget(e); setPayModal(true) }}
                            title="Registrar pago"
                            className="p-1.5 hover:bg-brand-50 rounded text-gray-400 hover:text-brand-600 transition-colors">
                            <CreditCard size={14} />
                          </button>
                        )}
                        {isAdmin && (
                          <button onClick={() => setConfirm(e)}
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
                  <tr className="bg-red-50">
                    <td colSpan={7} className="px-4 py-2 text-sm font-semibold text-red-800">TOTAL</td>
                    <td className="px-4 py-2 font-bold text-red-700">{fmt.usd(total)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)}
        title={modal === 'edit' ? 'Editar Egreso' : (isAdmin ? 'Nuevo Egreso' : 'Reportar Gasto')} size="lg">
        <EgresosForm
          initial={modal === 'edit' ? selected : null}
          onSave={() => { setModal(null); load() }}
          onCancel={() => setModal(null)}
        />
      </Modal>

      <ConfirmDialog
        open={!!confirm} onClose={() => setConfirm(null)} onConfirm={handleDelete}
        loading={deleting} title="Eliminar Egreso"
        message={`¿Eliminar el egreso "${confirm?.Concepto}"? Esta acción no se puede deshacer.`}
      />

      <Modal open={payModal} onClose={() => setPayModal(false)} title="Registrar Pago del Egreso" size="lg">
        <PagosForm
          prefill={payTarget ? {
            tipo: 'Pago a Proveedor',
            beneficiario: payTarget.Proveedor || '',
            concepto: payTarget.Concepto,
            monto: payTarget.Monto,
            egresoId: payTarget.ID,
          } : undefined}
          onSave={() => { setPayModal(false); load() }}
          onCancel={() => setPayModal(false)}
        />
      </Modal>
    </div>
  )
}
