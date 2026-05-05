import { useEffect, useState, useCallback } from 'react'
import { api } from '../../services/api'
import { fmt, ESTADOS_CONTRATO } from '../../utils/formatters'
import { exportContratosPDF } from '../../utils/exporters'
import Modal from '../UI/Modal'
import Spinner from '../UI/Spinner'
import ContratosForm from './ContratosForm'
import { Plus, Pencil, Download } from 'lucide-react'

export default function ContratosList() {
  const [data, setData]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [modal, setModal]       = useState(null)
  const [selected, setSelected] = useState(null)
  const [filtros, setFiltros]   = useState({ tipo: '', estado: '' })

  const load = useCallback(() => {
    setLoading(true)
    api.getContratos(filtros)
      .then(r => setData(r.data || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [filtros])

  useEffect(() => { load() }, [load])

  const totalClientes  = data.filter(c => c.Tipo === 'cliente').reduce((s, c) => s + (Number(c.ValorTotal)||0), 0)
  const totalProveedores = data.filter(c => c.Tipo === 'proveedor').reduce((s, c) => s + (Number(c.ValorTotal)||0), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <select className="input w-auto text-sm" value={filtros.tipo}
            onChange={e => setFiltros(f => ({ ...f, tipo: e.target.value }))}>
            <option value="">Todos</option>
            <option value="cliente">Clientes</option>
            <option value="proveedor">Proveedores</option>
          </select>
          <select className="input w-auto text-sm" value={filtros.estado}
            onChange={e => setFiltros(f => ({ ...f, estado: e.target.value }))}>
            <option value="">Todos los estados</option>
            <option value="activo">Activo</option>
            <option value="pendiente">Pendiente</option>
            <option value="vencido">Vencido</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportContratosPDF(data)} className="btn-secondary text-sm"><Download size={15}/> PDF</button>
          <button onClick={() => { setSelected(null); setModal('new') }} className="btn-primary text-sm">
            <Plus size={15}/> Nuevo Contrato
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Contratos', val: data.length, css: 'text-gray-900' },
          { label: 'Activos', val: data.filter(c => c.Estado === 'activo').length, css: 'text-emerald-600' },
          { label: 'Valor Clientes', val: fmt.usd(totalClientes), css: 'text-brand-700 font-bold' },
          { label: 'Valor Proveedores', val: fmt.usd(totalProveedores), css: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="card py-3 text-center">
            <p className={`text-base font-bold ${s.css}`}>{s.val}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      {loading ? <Spinner text="Cargando contratos..." /> : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Tipo','Nombre','Concepto','Valor Total','Inicio','Vence','Estado',''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-gray-400">Sin contratos registrados</td></tr>
                ) : data.map(c => (
                  <tr key={c.ID} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className={c.Tipo === 'cliente' ? 'badge-green' : 'badge-red'}>
                        {c.Tipo === 'cliente' ? 'Cliente' : 'Proveedor'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{c.Nombre}</td>
                    <td className="px-4 py-3 max-w-xs truncate">{c.Concepto}</td>
                    <td className="px-4 py-3 font-semibold text-brand-700 whitespace-nowrap">{fmt.usd(c.ValorTotal)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{fmt.date(c.FechaInicio)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{fmt.date(c.FechaFin)}</td>
                    <td className="px-4 py-3">
                      <span className={ESTADOS_CONTRATO[c.Estado]?.css || 'badge-gray'}>
                        {ESTADOS_CONTRATO[c.Estado]?.label || c.Estado}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => { setSelected(c); setModal('edit') }}
                        className="p-1.5 hover:bg-brand-50 rounded text-gray-400 hover:text-brand-600 transition-colors">
                        <Pencil size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)}
        title={modal === 'edit' ? 'Editar Contrato' : 'Nuevo Contrato'} size="lg">
        <ContratosForm
          initial={modal === 'edit' ? selected : null}
          onSave={() => { setModal(null); load() }}
          onCancel={() => setModal(null)}
        />
      </Modal>
    </div>
  )
}
