import { useEffect, useState, useCallback } from 'react'
import { api } from '../../services/api'
import { fmt, MODALIDADES, TIPOS_SERVICIO } from '../../utils/formatters'
import { useAuth } from '../../context/AuthContext'
import Modal from '../UI/Modal'
import Spinner from '../UI/Spinner'
import { Plus, Pencil, ToggleLeft, ToggleRight } from 'lucide-react'

const EMPTY = { nombre: '', tipo: '', modalidad: 'N/A', precio: '', duracion: '', descripcion: '', activo: true }

function ServicioForm({ initial, onSave, onCancel }) {
  const [form, setForm]   = useState(initial ? { ...EMPTY, ...initial } : EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (initial?.ID) await api.updateServicio(initial.ID, form)
      else await api.addServicio(form)
      onSave()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="label">Nombre del Servicio *</label>
          <input className="input" required value={form.nombre}
            onChange={e => set('nombre', e.target.value)} placeholder="Ej: Curso de Liderazgo" />
        </div>
        <div>
          <label className="label">Tipo *</label>
          <select className="input" required value={form.tipo} onChange={e => set('tipo', e.target.value)}>
            <option value="">Seleccionar...</option>
            {TIPOS_SERVICIO.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Modalidad</label>
          <select className="input" value={form.modalidad} onChange={e => set('modalidad', e.target.value)}>
            {MODALIDADES.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Precio base (USD)</label>
          <input className="input" type="number" step="0.01" min="0"
            value={form.precio} onChange={e => set('precio', e.target.value)} placeholder="0.00" />
        </div>
        <div>
          <label className="label">Duración</label>
          <input className="input" value={form.duracion}
            onChange={e => set('duracion', e.target.value)} placeholder="Ej: 40 horas, 2 días" />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Descripción</label>
          <textarea className="input" rows={3} value={form.descripcion}
            onChange={e => set('descripcion', e.target.value)} placeholder="Descripción del servicio..." />
        </div>
        {initial && (
          <div className="flex items-center gap-2">
            <input type="checkbox" id="activo" checked={form.activo}
              onChange={e => set('activo', e.target.checked)} className="w-4 h-4 accent-brand-600" />
            <label htmlFor="activo" className="text-sm text-gray-700">Servicio activo</label>
          </div>
        )}
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancelar</button>
        <button type="submit" className="btn-primary flex-1" disabled={saving}>
          {saving ? 'Guardando...' : initial?.ID ? 'Actualizar' : 'Crear Servicio'}
        </button>
      </div>
    </form>
  )
}

export default function ServiciosView() {
  const { isAdmin } = useAuth()
  const [data, setData]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [modal, setModal]       = useState(null)
  const [selected, setSelected] = useState(null)
  const [filtro, setFiltro]     = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api.getServicios()
      .then(r => setData(r.data || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = filtro ? data.filter(s => s.Tipo === filtro) : data
  const activos  = data.filter(s => s.Activo === true || s.Activo === 'TRUE').length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <select className="input w-auto text-sm" value={filtro} onChange={e => setFiltro(e.target.value)}>
            <option value="">Todos los tipos</option>
            {TIPOS_SERVICIO.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        {isAdmin && (
          <button onClick={() => { setSelected(null); setModal('new') }} className="btn-primary text-sm">
            <Plus size={15} /> Nuevo Servicio
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card py-3 text-center">
          <p className="text-xl font-bold text-gray-900">{data.length}</p>
          <p className="text-xs text-gray-500">Total Servicios</p>
        </div>
        <div className="card py-3 text-center">
          <p className="text-xl font-bold text-emerald-600">{activos}</p>
          <p className="text-xs text-gray-500">Activos</p>
        </div>
        <div className="card py-3 text-center">
          <p className="text-xl font-bold text-gray-400">{data.length - activos}</p>
          <p className="text-xs text-gray-500">Inactivos</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      {loading ? <Spinner text="Cargando servicios..." /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(s => {
            const activo = s.Activo === true || s.Activo === 'TRUE'
            return (
              <div key={s.ID} className={`card flex flex-col gap-2 ${!activo ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{s.Nombre}</p>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      <span className="badge-blue">{s.Tipo}</span>
                      <span className="badge-gray">{s.Modalidad}</span>
                    </div>
                  </div>
                  {isAdmin && (
                    <button onClick={() => { setSelected(s); setModal('edit') }}
                      className="p-1.5 hover:bg-brand-50 rounded text-gray-400 hover:text-brand-600 transition-colors flex-shrink-0">
                      <Pencil size={14} />
                    </button>
                  )}
                </div>
                {s.Descripcion && <p className="text-xs text-gray-500 line-clamp-2">{s.Descripcion}</p>}
                <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-50">
                  <div>
                    {Number(s.Precio) > 0
                      ? <p className="text-sm font-bold text-brand-700">{fmt.usd(s.Precio)}</p>
                      : <p className="text-xs text-gray-400">Precio variable</p>
                    }
                    {s.Duracion && <p className="text-xs text-gray-400">{s.Duracion}</p>}
                  </div>
                  <span className={activo ? 'badge-green' : 'badge-gray'}>
                    {activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {isAdmin && (
        <Modal open={!!modal} onClose={() => setModal(null)}
          title={modal === 'edit' ? 'Editar Servicio' : 'Nuevo Servicio'} size="md">
          <ServicioForm
            initial={modal === 'edit' ? selected : null}
            onSave={() => { setModal(null); load() }}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}
    </div>
  )
}
