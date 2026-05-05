import { useEffect, useState, useCallback } from 'react'
import { api } from '../../services/api'
import { fmt } from '../../utils/formatters'
import { exportPagosPDF } from '../../utils/exporters'
import Modal from '../UI/Modal'
import ConfirmDialog from '../UI/ConfirmDialog'
import Spinner from '../UI/Spinner'
import PagosForm from './PagosForm'
import { Plus, Pencil, Trash2, Download } from 'lucide-react'

const ESTADO_CSS = { completado: 'badge-green', pendiente: 'badge-yellow', cancelado: 'badge-red' }

export default function PagosList() {
  const [data, setData]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [modal, setModal]       = useState(null)
  const [selected, setSelected] = useState(null)
  const [confirm, setConfirm]   = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [filtros, setFiltros]   = useState({ tipo: '', estado: '', desde: '', hasta: '' })

  const load = useCallback(() => {
    setLoading(true)
    api.getPagos(filtros)
      .then(r => setData(r.data || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [filtros])

  useEffect(() => { load() }, [load])

  async function handleDelete() {
    setDeleting(true)
    try { await api.deletePago(confirm.ID); setConfirm(null); load() }
    catch (e) { setError(e.message) }
    finally { setDeleting(false) }
  }

  const total = data.reduce((s, p) => s + (Number(p.Monto) || 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <select className="input w-auto text-sm" value={filtros.tipo}
            onChange={e => setFiltros(f => ({ ...f, tipo: e.target.value }))}>
            <option value="">Todos los tipos</option>
            <option>Transferencia bancaria</option>
            <option>Pago a proveedor</option>
            <option>Pago de factura</option>
            <option>Otro</option>
          </select>
          <select className="input w-auto text-sm" value={filtros.estado}
            onChange={e => setFiltros(f => ({ ...f, estado: e.target.value }))}>
            <option value="">Todos los estados</option>
            <option value="completado">Completado</option>
            <option value="pendiente">Pendiente</option>
            <option value="cancelado">Cancelado</option>
          </select>
          <input className="input w-36 text-sm" type="date" value={filtros.desde}
            onChange={e => setFiltros(f => ({ ...f, desde: e.target.value }))} />
          <input className="input w-36 text-sm" type="date" value={filtros.hasta}
            onChange={e => setFiltros(f => ({ ...f, hasta: e.target.value }))} />
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportPagosPDF(data)} className="btn-secondary text-sm"><Download size={15} /> PDF</button>
          <button onClick={() => { setSelected(null); setModal('new') }} className="btn-primary text-sm">
            <Plus size={15} /> Nuevo Pago
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card py-3 text-center">
          <p className="text-xl font-bold text-brand-700">{fmt.usd(total)}</p>
          <p className="text-xs text-gray-500">Total Pagado</p>
        </div>
        <div className="card py-3 text-center">
          <p className="text-xl font-bold text-emerald-600">{data.filter(p => p.Estado === 'completado').length}</p>
          <p className="text-xs text-gray-500">Completados</p>
        </div>
        <div className="card py-3 text-center">
          <p className="text-xl font-bold text-amber-600">{data.filter(p => p.Estado === 'pendiente').length}</p>
          <p className="text-xs text-gray-500">Pendientes</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      {loading ? <Spinner text="Cargando pagos..." /> : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Fecha','Tipo','Beneficiario','Concepto','Referencia','Método','Estado','Monto',''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-10 text-gray-400">Sin pagos registrados</td></tr>
                ) : data.map(p => (
                  <tr key={p.ID} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">{fmt.date(p.Fecha)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{p.Tipo}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{p.Beneficiario}</td>
                    <td className="px-4 py-3 max-w-xs truncate">{p.Concepto}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">{p.Referencia || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{p.MetodoPago}</td>
                    <td className="px-4 py-3">
                      <span className={ESTADO_CSS[p.Estado] || 'badge-gray'}>{p.Estado}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-brand-700 whitespace-nowrap">{fmt.usd(p.Monto)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => { setSelected(p); setModal('edit') }}
                          className="p-1.5 hover:bg-brand-50 rounded text-gray-400 hover:text-brand-600 transition-colors">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => setConfirm(p)}
                          className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {data.length > 0 && (
                <tfoot>
                  <tr className="bg-brand-50">
                    <td colSpan={7} className="px-4 py-2 text-sm font-semibold text-brand-800">TOTAL</td>
                    <td className="px-4 py-2 font-bold text-brand-700">{fmt.usd(total)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)}
        title={modal === 'edit' ? 'Editar Pago' : 'Nuevo Pago'} size="lg">
        <PagosForm
          initial={modal === 'edit' ? selected : null}
          onSave={() => { setModal(null); load() }}
          onCancel={() => setModal(null)}
        />
      </Modal>

      <ConfirmDialog
        open={!!confirm} onClose={() => setConfirm(null)} onConfirm={handleDelete}
        loading={deleting} title="Eliminar Pago"
        message={`¿Eliminar el pago a "${confirm?.Beneficiario}"?`}
      />
    </div>
  )
}
