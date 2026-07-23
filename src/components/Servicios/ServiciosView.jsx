import { useEffect, useState, useCallback } from 'react'
import { api } from '../../services/api'
import { fmt, MODALIDADES, TIPOS_SERVICIO } from '../../utils/formatters'
import { useAuth } from '../../context/AuthContext'
import Modal from '../UI/Modal'
import Spinner from '../UI/Spinner'
import { Plus, Pencil, ToggleLeft, ToggleRight, MessageCircle, Calendar } from 'lucide-react'

const EMPTY = { nombre: '', tipo: '', modalidad: 'N/A', precio: '', duracion: '', descripcion: '', activo: true, fechaEvento: '', fechaFinEvento: '', lugarEvento: '' }

function requiereDuracionAcademica(tipo) {
  const normalized = String(tipo || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return ['curso', 'certificacion', 'taller', 'certificado lms', 'capacitacion'].includes(normalized)
}

function mapInitial(initial) {
  if (!initial) return EMPTY
  return {
    nombre:        initial.Nombre        || initial.nombre        || '',
    tipo:          initial.Tipo          || initial.tipo          || '',
    modalidad:     initial.Modalidad     || initial.modalidad     || 'N/A',
    precio:        initial.Precio        || initial.precio        || '',
    duracion:      initial.Duracion      || initial.duracion      || '',
    descripcion:   initial.Descripcion   || initial.descripcion   || '',
    activo:        initial.Activo === true || initial.Activo === 'TRUE' || initial.activo === true,
    fechaEvento:   initial.FechaEvento   || initial.fechaEvento   || '',
    fechaFinEvento:initial.FechaFinEvento|| initial.fechaFinEvento|| '',
    lugarEvento:   initial.LugarEvento   || initial.lugarEvento   || '',
  }
}

function ServicioForm({ initial, onSave, onCancel }) {
  const [form, setForm]   = useState(() => mapInitial(initial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (requiereDuracionAcademica(form.tipo) && !String(form.duracion || '').trim()) {
      setError('La duración académica es obligatoria para emitir certificados de este servicio.')
      return
    }
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
          <label className="label">Duración académica {requiereDuracionAcademica(form.tipo) && '*'}</label>
          <input className="input" required={requiereDuracionAcademica(form.tipo)} value={form.duracion}
            onChange={e => set('duracion', e.target.value)} placeholder="Ej.: 40 o 40 horas" />
          <p className="mt-1 text-xs text-gray-400">Este dato aparecerá en el certificado.</p>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Descripción</label>
          <textarea className="input" rows={3} value={form.descripcion}
            onChange={e => set('descripcion', e.target.value)} placeholder="Descripción del servicio..." />
        </div>
        <div className="sm:col-span-2 border-t border-gray-100 pt-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Fecha del Evento (opcional)</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Fecha inicio evento</label>
              <input className="input" type="date" value={form.fechaEvento}
                onChange={e => set('fechaEvento', e.target.value)} />
            </div>
            <div>
              <label className="label">Fecha fin evento</label>
              <input className="input" type="date" value={form.fechaFinEvento}
                onChange={e => set('fechaFinEvento', e.target.value)} />
            </div>
            <div>
              <label className="label">Lugar / Modalidad</label>
              <input className="input" value={form.lugarEvento}
                onChange={e => set('lugarEvento', e.target.value)} placeholder="Ej: Quito, Online" />
            </div>
          </div>
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

  function handleShareCatalogo() {
    const activosList = data.filter(s => s.Activo === true || s.Activo === 'TRUE')
    const lineas = [
      '*R.A. Training — Catálogo de Servicios*',
      '',
      'Estos son nuestros servicios disponibles:',
      '',
      ...activosList.map(s => {
        const precio = Number(s.Precio) > 0 ? `$${Number(s.Precio).toFixed(2)} USD` : 'Precio a consultar'
        const partes = [`📌 *${s.Nombre}*`, `   Tipo: ${s.Tipo} | Modalidad: ${s.Modalidad}`, `   💵 ${precio}`]
        if (s.Duracion) partes.push(`   ⏱ ${s.Duracion}`)
        if (s.Descripcion) partes.push(`   ${s.Descripcion}`)
        return partes.join('\n')
      }),
      '',
      '¡Contáctanos para más información! 🎓',
    ]
    const msg = lineas.join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <select className="input w-auto text-sm" value={filtro} onChange={e => setFiltro(e.target.value)}>
            <option value="">Todos los tipos</option>
            {TIPOS_SERVICIO.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={handleShareCatalogo} className="btn-secondary text-sm">
            <MessageCircle size={15} /> Catálogo WhatsApp
          </button>
          {isAdmin && (
            <button onClick={() => { setSelected(null); setModal('new') }} className="btn-primary text-sm">
              <Plus size={15} /> Nuevo Servicio
            </button>
          )}
        </div>
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
                {s.FechaEvento && (
                  <div className="flex items-center gap-1.5 text-xs text-brand-700 bg-brand-50 rounded-lg px-2 py-1.5">
                    <Calendar size={12} />
                    <span>{fmt.date(s.FechaEvento)}{s.FechaFinEvento && s.FechaFinEvento !== s.FechaEvento ? ` → ${fmt.date(s.FechaFinEvento)}` : ''}</span>
                    {s.LugarEvento && <span className="text-gray-400">· {s.LugarEvento}</span>}
                  </div>
                )}
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
