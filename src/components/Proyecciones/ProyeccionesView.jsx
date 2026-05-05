import { useEffect, useState, useCallback } from 'react'
import { api } from '../../services/api'
import { fmt, TIPOS_PROYECCION, ESTADOS_PROYECCION } from '../../utils/formatters'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, LineChart, Line,
} from 'recharts'
import Modal from '../UI/Modal'
import Spinner from '../UI/Spinner'
import { Plus, Pencil, TrendingUp } from 'lucide-react'

const EMPTY = {
  evento: '', tipo: '', fechaEstimada: '', montoProyectado: '',
  montoReal: '', estado: 'proyectado', notas: '',
}

function mapInitial(initial) {
  if (!initial) return EMPTY
  return {
    evento:          initial.Evento          || initial.evento          || '',
    tipo:            initial.Tipo            || initial.tipo            || '',
    fechaEstimada:   initial.FechaEstimada   || initial.fechaEstimada   || '',
    montoProyectado: initial.MontoProyectado || initial.montoProyectado || '',
    montoReal:       initial.MontoReal       || initial.montoReal       || '',
    estado:          initial.Estado          || initial.estado          || 'proyectado',
    notas:           initial.Notas           || initial.notas           || '',
  }
}

function ProyeccionForm({ initial, onSave, onCancel }) {
  const [form, setForm]   = useState(() => mapInitial(initial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (initial?.ID) await api.updateProyeccion(initial.ID, form)
      else await api.addProyeccion(form)
      onSave()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="label">Evento / Actividad *</label>
          <input className="input" required value={form.evento}
            onChange={e => set('evento', e.target.value)} placeholder="Ej: Curso de Liderazgo — Empresa XYZ" />
        </div>
        <div>
          <label className="label">Tipo *</label>
          <select className="input" required value={form.tipo} onChange={e => set('tipo', e.target.value)}>
            <option value="">Seleccionar...</option>
            {TIPOS_PROYECCION.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Fecha Estimada *</label>
          <input className="input" type="date" required value={form.fechaEstimada}
            onChange={e => set('fechaEstimada', e.target.value)} />
        </div>
        <div>
          <label className="label">Monto Proyectado (USD) *</label>
          <input className="input" type="number" step="0.01" min="0" required
            value={form.montoProyectado} onChange={e => set('montoProyectado', e.target.value)} placeholder="0.00" />
        </div>
        <div>
          <label className="label">Monto Real (si ya ocurrió)</label>
          <input className="input" type="number" step="0.01" min="0"
            value={form.montoReal} onChange={e => set('montoReal', e.target.value)} placeholder="0.00" />
        </div>
        <div>
          <label className="label">Estado</label>
          <select className="input" value={form.estado} onChange={e => set('estado', e.target.value)}>
            <option value="proyectado">Proyectado</option>
            <option value="confirmado">Confirmado</option>
            <option value="realizado">Realizado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Notas</label>
          <textarea className="input" rows={2} value={form.notas} onChange={e => set('notas', e.target.value)} />
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancelar</button>
        <button type="submit" className="btn-primary flex-1" disabled={saving}>
          {saving ? 'Guardando...' : initial?.ID ? 'Actualizar' : 'Crear Proyección'}
        </button>
      </div>
    </form>
  )
}

export default function ProyeccionesView() {
  const [data, setData]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [modal, setModal]       = useState(null)
  const [selected, setSelected] = useState(null)
  const [filtroEstado, setFiltroEstado] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api.getProyecciones(filtroEstado ? { estado: filtroEstado } : {})
      .then(r => setData(r.data || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [filtroEstado])

  useEffect(() => { load() }, [load])

  const totalProyectado = data.reduce((s, p) => s + (Number(p.MontoProyectado)||0), 0)
  const totalReal       = data.reduce((s, p) => s + (Number(p.MontoReal)||0), 0)

  // Chart data - by month
  const chartData = data
    .filter(p => p.FechaEstimada)
    .sort((a, b) => new Date(a.FechaEstimada) - new Date(b.FechaEstimada))
    .map(p => ({
      evento: p.Evento.length > 20 ? p.Evento.slice(0,20) + '…' : p.Evento,
      Proyectado: Number(p.MontoProyectado) || 0,
      Real: Number(p.MontoReal) || 0,
    }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <select className="input w-auto text-sm" value={filtroEstado}
            onChange={e => setFiltroEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="proyectado">Proyectado</option>
            <option value="confirmado">Confirmado</option>
            <option value="realizado">Realizado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
        <button onClick={() => { setSelected(null); setModal('new') }} className="btn-primary text-sm">
          <Plus size={15}/> Nueva Proyección
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Proyectado', val: fmt.usd(totalProyectado), css: 'text-brand-700 font-bold' },
          { label: 'Total Real',       val: fmt.usd(totalReal),       css: 'text-emerald-600 font-bold' },
          { label: 'Diferencia',       val: fmt.usd(totalReal - totalProyectado), css: (totalReal - totalProyectado) >= 0 ? 'text-emerald-600' : 'text-red-600' },
          { label: 'Proyecciones',     val: data.length,              css: 'text-gray-900' },
        ].map(s => (
          <div key={s.label} className="card py-3 text-center">
            <p className={`text-base font-bold ${s.css}`}>{s.val}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4 text-sm flex items-center gap-2">
            <TrendingUp size={16} className="text-brand-600" /> Proyectado vs Real por Evento
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="evento" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => fmt.usd(v)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Proyectado" fill="#6366f1" radius={[4,4,0,0]} />
              <Bar dataKey="Real"       fill="#059669" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      {loading ? <Spinner text="Cargando proyecciones..." /> : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Evento','Tipo','Fecha Est.','Proyectado','Real','Diferencia','Estado',''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-gray-400">Sin proyecciones registradas</td></tr>
                ) : data.map(p => {
                  const diff = (Number(p.MontoReal)||0) - (Number(p.MontoProyectado)||0)
                  return (
                    <tr key={p.ID} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 max-w-xs truncate font-medium">{p.Evento}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{p.Tipo}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{fmt.date(p.FechaEstimada)}</td>
                      <td className="px-4 py-3 font-semibold text-brand-700 whitespace-nowrap">{fmt.usd(p.MontoProyectado)}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-600 whitespace-nowrap">{fmt.usd(p.MontoReal)}</td>
                      <td className={`px-4 py-3 font-semibold whitespace-nowrap ${diff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {diff >= 0 ? '+' : ''}{fmt.usd(diff)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={ESTADOS_PROYECCION[p.Estado]?.css || 'badge-gray'}>
                          {ESTADOS_PROYECCION[p.Estado]?.label || p.Estado}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => { setSelected(p); setModal('edit') }}
                          className="p-1.5 hover:bg-brand-50 rounded text-gray-400 hover:text-brand-600 transition-colors">
                          <Pencil size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)}
        title={modal === 'edit' ? 'Editar Proyección' : 'Nueva Proyección'} size="lg">
        <ProyeccionForm
          initial={modal === 'edit' ? selected : null}
          onSave={() => { setModal(null); load() }}
          onCancel={() => setModal(null)}
        />
      </Modal>
    </div>
  )
}
