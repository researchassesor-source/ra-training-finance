import { useEffect, useState, useCallback } from 'react'
import { api } from '../../services/api'
import { fmt, MODALIDADES, TIPOS_SERVICIO } from '../../utils/formatters'
import { useAuth } from '../../context/AuthContext'
import Modal from '../UI/Modal'
import Spinner from '../UI/Spinner'
import { Plus, Pencil, MessageCircle, Calendar, UserRound, EyeOff, CheckCircle2 } from 'lucide-react'

const EMPTY = {
  nombre: '', tipo: '', modalidad: 'N/A', precio: '', duracion: '', descripcion: '',
  activo: true, fechaEvento: '', fechaFinEvento: '', lugarEvento: '',
  capacitador: '', estadoEvento: 'programado',
}

const ESTADOS_EVENTO = [
  { value: 'programado', label: 'Programado / visible en calendario' },
  { value: 'finalizado', label: 'Finalizado / oculto del calendario activo' },
  { value: 'oculto', label: 'Oculto temporalmente del calendario' },
  { value: 'cancelado', label: 'Cancelado / oculto del calendario' },
]

function normalizarEstadoEvento(value) {
  return ['programado', 'finalizado', 'oculto', 'cancelado'].includes(String(value || '').toLowerCase())
    ? String(value).toLowerCase()
    : 'programado'
}

function dateOnly(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

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
    fechaEvento:   dateOnly(initial.FechaEvento   || initial.fechaEvento),
    fechaFinEvento:dateOnly(initial.FechaFinEvento|| initial.fechaFinEvento),
    lugarEvento:   initial.LugarEvento   || initial.lugarEvento   || '',
    capacitador:   initial.Capacitador   || initial.capacitador   || '',
    estadoEvento:  normalizarEstadoEvento(initial.EstadoEvento || initial.estadoEvento),
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
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fecha del evento en calendario</p>
              <p className="text-xs text-gray-400">El estado del curso y el estado de la fecha se manejan por separado.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <label className="label">Capacitador</label>
              <input className="input" value={form.capacitador}
                onChange={e => set('capacitador', e.target.value)} placeholder="Ej: Alexandra Villagómez" />
            </div>
            <div>
              <label className="label">Lugar / Modalidad del evento</label>
              <input className="input" value={form.lugarEvento}
                onChange={e => set('lugarEvento', e.target.value)} placeholder="Ej: Quito, Online" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Estado de la fecha en calendario</label>
              <select className="input" value={form.estadoEvento} onChange={e => set('estadoEvento', e.target.value)}>
                {ESTADOS_EVENTO.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
              <p className="mt-1 text-xs text-gray-400">
                “Servicio activo” controla si se vende. Este estado controla si la fecha aparece como evento activo.
              </p>
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
            const estadoEvento = normalizarEstadoEvento(s.EstadoEvento)
            const fechaEvento = dateOnly(s.FechaEvento)
            const fechaFin = dateOnly(s.FechaFinEvento || s.FechaEvento)
            const eventoVencido = fechaFin && fechaFin < new Date().toISOString().slice(0, 10)
            const eventoVisible = estadoEvento === 'programado'
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
                {s.Capacitador && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-700 bg-slate-50 rounded-lg px-2 py-1.5">
                    <UserRound size={12} />
                    <span className="font-medium">Capacitador:</span>
                    <span>{s.Capacitador}</span>
                  </div>
                )}
                {fechaEvento && (
                  <div className={`flex items-center gap-1.5 text-xs rounded-lg px-2 py-1.5 ${
                    eventoVisible ? 'text-brand-700 bg-brand-50' : 'text-gray-600 bg-gray-50'
                  }`}>
                    <Calendar size={12} />
                    <span>{fmt.date(fechaEvento)}{fechaFin && fechaFin !== fechaEvento ? ` → ${fmt.date(fechaFin)}` : ''}</span>
                    {s.LugarEvento && <span className="text-gray-400">· {s.LugarEvento}</span>}
                  </div>
                )}
                {fechaEvento && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className={eventoVisible ? 'badge-blue' : estadoEvento === 'finalizado' ? 'badge-green' : 'badge-gray'}>
                      {estadoEvento === 'programado' ? (eventoVencido ? 'Fecha vencida por revisar' : 'Evento visible') :
                        estadoEvento === 'finalizado' ? 'Evento finalizado' :
                        estadoEvento === 'cancelado' ? 'Evento cancelado' : 'Evento oculto'}
                    </span>
                    {!eventoVisible && <span className="badge-gray inline-flex items-center gap-1"><EyeOff size={11} /> No aparece en calendario</span>}
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
                {isAdmin && fechaEvento && eventoVisible && (
                  <button
                    onClick={() => api.updateServicio(s.ID, {
                      nombre: s.Nombre, tipo: s.Tipo, modalidad: s.Modalidad, precio: s.Precio,
                      duracion: s.Duracion, descripcion: s.Descripcion, activo,
                      fechaEvento, fechaFinEvento: fechaFin,
                      lugarEvento: s.LugarEvento, capacitador: s.Capacitador,
                      estadoEvento: 'finalizado',
                    }).then(load).catch(e => setError(e.message))}
                    className="btn-secondary text-xs justify-center"
                  >
                    <CheckCircle2 size={13} /> Marcar fecha como finalizada
                  </button>
                )}
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
