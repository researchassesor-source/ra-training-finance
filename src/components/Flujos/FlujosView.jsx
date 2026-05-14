import { useEffect, useState, useCallback } from 'react'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { fmt } from '../../utils/formatters'
import Modal from '../UI/Modal'
import ConfirmDialog from '../UI/ConfirmDialog'
import TableSkeleton from '../UI/TableSkeleton'
import {
  Plus, Pencil, Trash2, CheckCircle, Clock, ChevronLeft, ChevronRight,
  ListChecks, PlayCircle, AlertCircle, Paperclip, ExternalLink,
} from 'lucide-react'

const DIAS_SEMANA = ['Lunes','Martes','Miércoles','Jueves','Viernes']

function getMondayOf(dateStr) {
  let d
  if (dateStr) {
    d = new Date(dateStr + 'T12:00:00Z')
  } else {
    const now = new Date()
    d = new Date(
      now.getUTCFullYear() + '-' +
      String(now.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(now.getUTCDate()).padStart(2, '0') + 'T12:00:00Z'
    )
  }
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const ESTADO_ACT = {
  pendiente:   { label: 'Pendiente',    css: 'bg-gray-100 text-gray-600',    icon: Clock },
  en_proceso:  { label: 'En proceso',   css: 'bg-blue-100 text-blue-700',    icon: PlayCircle },
  completado:  { label: 'Completado',   css: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  bloqueado:   { label: 'Bloqueado',    css: 'bg-red-100 text-red-700',      icon: AlertCircle },
}

function ActividadCard({ act, isAdmin, onUpdate, onDelete }) {
  const [editHoras, setEditHoras]       = useState(false)
  const [editEvidencia, setEditEvidencia] = useState(false)
  const [horas, setHoras]               = useState(act.HorasReales || 0)
  const [notas, setNotas]               = useState(act.Notas || '')
  const [evidencia, setEvidencia]       = useState(act.Evidencia || '')
  const [saving, setSaving]             = useState(false)
  const est = ESTADO_ACT[act.Estado] || ESTADO_ACT.pendiente
  const Icon = est.icon

  async function saveHoras() {
    setSaving(true)
    await onUpdate(act.ID, { horasReales: Number(horas), notas })
    setSaving(false)
    setEditHoras(false)
  }

  async function saveEvidencia() {
    setSaving(true)
    await onUpdate(act.ID, { evidencia })
    setSaving(false)
    setEditEvidencia(false)
  }

  const isUrl = (s) => s && (s.startsWith('http://') || s.startsWith('https://'))

  return (
    <div className={`border rounded-xl p-4 space-y-2 transition-all
      ${act.Estado === 'completado' ? 'bg-emerald-50 border-emerald-200' :
        act.Estado === 'en_proceso' ? 'bg-blue-50 border-blue-200' :
        act.Estado === 'bloqueado'  ? 'bg-red-50 border-red-200' :
        'bg-white border-gray-200'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-sm ${act.Estado === 'completado' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
            {act.Titulo}
          </p>
          {act.Descripcion && <p className="text-xs text-gray-500 mt-0.5">{act.Descripcion}</p>}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {isAdmin && (
            <button onClick={() => onDelete(act)} className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-600">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${est.css}`}>
          <Icon size={11} /> {est.label}
        </span>
        <span className="text-gray-400">{act.DiaSemana}</span>
        <span className="text-gray-400">{act.HorasEstimadas}h estimadas</span>
        {Number(act.HorasReales) > 0 && (
          <span className="text-emerald-700 font-medium">{act.HorasReales}h reales</span>
        )}
      </div>

      {/* Evidencia adjunta */}
      {act.Evidencia && (
        <div className="flex items-center gap-1.5 text-xs text-gray-600 bg-white/70 rounded-lg px-2.5 py-1.5 border border-gray-200">
          <Paperclip size={12} className="text-gray-400 flex-shrink-0" />
          {isUrl(act.Evidencia) ? (
            <a href={act.Evidencia} target="_blank" rel="noopener noreferrer"
              className="text-brand-600 hover:underline flex items-center gap-1 truncate">
              Ver evidencia <ExternalLink size={11} />
            </a>
          ) : (
            <span className="truncate">{act.Evidencia}</span>
          )}
        </div>
      )}

      {/* Controles de estado */}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {act.Estado === 'pendiente' && (
          <button onClick={() => onUpdate(act.ID, { estado: 'en_proceso' })}
            className="text-xs px-2.5 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1">
            <PlayCircle size={12} /> Iniciar
          </button>
        )}
        {act.Estado === 'en_proceso' && (
          <>
            <button onClick={() => { setEditHoras(v => !v); setEditEvidencia(false) }}
              className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center gap-1">
              <Clock size={12} /> Horas reales
            </button>
            <button onClick={() => onUpdate(act.ID, { estado: 'completado', horasReales: Number(horas) })}
              className="text-xs px-2.5 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1">
              <CheckCircle size={12} /> Completar
            </button>
          </>
        )}
        {/* Evidencia disponible en cualquier estado (excepto pendiente) */}
        {act.Estado !== 'pendiente' && (
          <button onClick={() => { setEditEvidencia(v => !v); setEditHoras(false) }}
            className="text-xs px-2.5 py-1 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 flex items-center gap-1">
            <Paperclip size={12} /> {act.Evidencia ? 'Editar evidencia' : 'Agregar evidencia'}
          </button>
        )}
      </div>

      {/* Panel: Horas reales */}
      {editHoras && (
        <div className="pt-2 space-y-2">
          <div className="flex gap-2">
            <input type="number" step="0.5" min="0" className="input text-sm flex-1"
              value={horas} onChange={e => setHoras(e.target.value)} placeholder="Horas trabajadas" />
            <button onClick={saveHoras} disabled={saving} className="btn-primary text-xs px-3">
              {saving ? '...' : 'Guardar'}
            </button>
          </div>
          <textarea className="input text-xs" rows={2} value={notas}
            onChange={e => setNotas(e.target.value)} placeholder="Notas opcionales..." />
        </div>
      )}

      {/* Panel: Evidencia */}
      {editEvidencia && (
        <div className="pt-2 space-y-2">
          <p className="text-xs text-gray-500">Pega un enlace (Drive, Dropbox, etc.) o escribe una descripción del trabajo realizado.</p>
          <textarea className="input text-xs" rows={3} value={evidencia}
            onChange={e => setEvidencia(e.target.value)}
            placeholder="https://drive.google.com/... o descripción de lo que se realizó" />
          <div className="flex gap-2">
            <button onClick={() => setEditEvidencia(false)} className="btn-secondary text-xs flex-1">Cancelar</button>
            <button onClick={saveEvidencia} disabled={saving} className="btn-primary text-xs flex-1">
              {saving ? 'Guardando...' : 'Guardar evidencia'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function NuevaActividadForm({ flujoId, username, onSave, onCancel }) {
  const [form, setForm] = useState({
    titulo: '', descripcion: '', diaSemana: 'Lunes', horasEstimadas: 1,
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.addActividadFlujo({ ...form, flujoId, username })
      onSave()
    } catch (err) { /* ignore */ }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 border border-dashed border-brand-300 rounded-xl p-4 bg-brand-50">
      <p className="text-xs font-semibold text-brand-700 uppercase tracking-wide">Nueva actividad</p>
      <input className="input text-sm" required placeholder="Título de la actividad *"
        value={form.titulo} onChange={e => set('titulo', e.target.value)} />
      <textarea className="input text-sm" rows={2} placeholder="Descripción (opcional)"
        value={form.descripcion} onChange={e => set('descripcion', e.target.value)} />
      <div className="flex gap-2">
        <select className="input text-sm flex-1" value={form.diaSemana} onChange={e => set('diaSemana', e.target.value)}>
          {DIAS_SEMANA.map(d => <option key={d}>{d}</option>)}
        </select>
        <input type="number" min="0.5" step="0.5" className="input text-sm w-28"
          value={form.horasEstimadas} onChange={e => set('horasEstimadas', Number(e.target.value))}
          placeholder="Horas" />
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary text-xs flex-1">Cancelar</button>
        <button type="submit" disabled={saving} className="btn-primary text-xs flex-1">
          {saving ? 'Guardando...' : 'Agregar Actividad'}
        </button>
      </div>
    </form>
  )
}

export default function FlujosView() {
  const { isAdmin, user } = useAuth()
  const [semana, setSemana]       = useState(getMondayOf())
  const [flujos, setFlujos]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [usuarios, setUsuarios]   = useState([])
  const [usuarioSel, setUsuarioSel] = useState('')
  const [showNuevoFlujo, setShowNuevoFlujo]   = useState(false)
  const [showNuevaAct, setShowNuevaAct]       = useState(null)
  const [confirmDel, setConfirmDel]           = useState(null)      // actividad
  const [confirmDelFlujo, setConfirmDelFlujo] = useState(false)     // flujo completo
  const [editFlujo, setEditFlujo]             = useState(false)     // panel editar flujo
  const [deleting, setDeleting]               = useState(false)
  const [horasPlan, setHorasPlan]             = useState(40)
  const [notasFlujo, setNotasFlujo]           = useState('')
  const [editHorasPlan, setEditHorasPlan]     = useState(40)
  const [editNotas, setEditNotas]             = useState('')
  const [saving, setSaving]                   = useState(false)

  const targetUser = isAdmin
    ? (usuarioSel || (usuarios[0]?.Username || ''))
    : (user?.username || '')

  const load = useCallback(() => {
    if (!targetUser) return
    setLoading(true)
    api.getFlujosSemana({ username: targetUser, semana })
      .then(r => setFlujos(r.data || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [semana, targetUser])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (isAdmin) {
      api.getUsuarios()
        .then(r => {
          const activos = (r.data || []).filter(u => u.Activo === true || u.Activo === 'TRUE')
          setUsuarios(activos)
          if (!usuarioSel && activos.length > 0) setUsuarioSel(activos[0].Username)
        })
        .catch(() => {})
    }
  }, [isAdmin])

  const semanaLabel = (() => {
    const d   = new Date(semana + 'T12:00:00Z')
    const fin = new Date(semana + 'T12:00:00Z')
    fin.setUTCDate(fin.getUTCDate() + 4)
    return `${d.getUTCDate()} – ${fin.getUTCDate()} ${fin.toLocaleDateString('es-EC', { month:'long', year:'numeric' })}`
  })()

  async function crearFlujo() {
    setSaving(true)
    try {
      await api.addFlujoSemanal({ username: targetUser, semana, totalHorasPlan: horasPlan, notas: notasFlujo })
      setShowNuevoFlujo(false)
      load()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function handleUpdateAct(id, data) {
    try { await api.updateActividadFlujo(id, data); load() }
    catch (e) { setError(e.message) }
  }

  async function handleDeleteAct() {
    setDeleting(true)
    try { await api.deleteActividadFlujo(confirmDel.ID); setConfirmDel(null); load() }
    catch (e) { setError(e.message) }
    finally { setDeleting(false) }
  }

  async function handleEditFlujo() {
    setSaving(true)
    try {
      await api.updateFlujoSemanal(flujoActual.ID, { totalHorasPlan: editHorasPlan, notas: editNotas })
      setEditFlujo(false)
      load()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function handleDeleteFlujo() {
    setDeleting(true)
    try {
      await api.deleteFlujoSemanal(flujoActual.ID)
      setConfirmDelFlujo(false)
      load()
    } catch (e) { setError(e.message) }
    finally { setDeleting(false) }
  }

  function openEditFlujo() {
    setEditHorasPlan(Number(flujoActual.TotalHorasPlan) || 40)
    setEditNotas(flujoActual.Notas || '')
    setEditFlujo(true)
  }

  const flujoActual = flujos[0]
  const totalEst   = flujoActual?.actividades?.reduce((s, a) => s + (Number(a.HorasEstimadas) || 0), 0) || 0
  const totalReal  = flujoActual?.actividades?.reduce((s, a) => s + (Number(a.HorasReales) || 0), 0) || 0
  const completadas = flujoActual?.actividades?.filter(a => a.Estado === 'completado').length || 0
  const totalActs   = flujoActual?.actividades?.length || 0

  // Agrupar actividades por día
  const actsByDia = DIAS_SEMANA.reduce((acc, d) => {
    acc[d] = (flujoActual?.actividades || []).filter(a => a.DiaSemana === d)
    return acc
  }, {})

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Flujos Semanales de Trabajo</h2>
          <p className="text-sm text-gray-500">Planificación y seguimiento de actividades</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <select className="input w-auto text-sm" value={usuarioSel}
              onChange={e => setUsuarioSel(e.target.value)}>
              {usuarios.map(u => <option key={u.ID} value={u.Username}>{u.Nombre}</option>)}
            </select>
          )}
          <button onClick={() => setSemana(s => addDays(s, -7))}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"><ChevronLeft size={18} /></button>
          <span className="text-sm font-medium text-gray-700 whitespace-nowrap px-1">{semanaLabel}</span>
          <button onClick={() => setSemana(s => addDays(s, 7))}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"><ChevronRight size={18} /></button>
          <button onClick={() => setSemana(getMondayOf())} className="btn-secondary text-sm">Esta semana</button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      {loading ? <TableSkeleton cols={3} rows={6} /> : (
        <>
          {!flujoActual ? (
            /* ── Sin flujo para esta semana ── */
            <div className="card text-center py-12">
              <ListChecks size={40} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">
                {isAdmin
                  ? `No hay flujo creado para ${targetUser} esta semana`
                  : 'No tienes un plan de trabajo asignado para esta semana'}
              </p>
              {isAdmin && (
                <button onClick={() => setShowNuevoFlujo(v => !v)}
                  className="btn-primary text-sm mt-4 mx-auto inline-flex items-center gap-2">
                  <Plus size={16} /> Crear flujo semanal
                </button>
              )}
              {showNuevoFlujo && (
                <div className="mt-6 max-w-sm mx-auto text-left space-y-3 bg-gray-50 rounded-xl p-4">
                  <p className="text-sm font-semibold text-gray-700">Nuevo flujo — semana del {semanaLabel}</p>
                  <div>
                    <label className="label">Horas planificadas</label>
                    <input type="number" className="input" value={horasPlan}
                      onChange={e => setHorasPlan(Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="label">Notas (opcional)</label>
                    <textarea className="input" rows={2} value={notasFlujo}
                      onChange={e => setNotasFlujo(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setShowNuevoFlujo(false)} className="btn-secondary flex-1 text-sm">Cancelar</button>
                    <button onClick={crearFlujo} disabled={saving} className="btn-primary flex-1 text-sm">
                      {saving ? 'Creando...' : 'Crear flujo'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Cabecera del flujo con acciones admin */}
              {isAdmin && (
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-gray-500">Flujo asignado a <span className="font-semibold text-gray-700">{targetUser}</span> · semana {semanaLabel}</p>
                    {flujoActual.Notas && <p className="text-xs text-gray-400 mt-0.5 italic">{flujoActual.Notas}</p>}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={openEditFlujo}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors">
                      <Pencil size={13} /> Editar flujo
                    </button>
                    <button onClick={() => setConfirmDelFlujo(true)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-medium transition-colors">
                      <Trash2 size={13} /> Eliminar
                    </button>
                  </div>
                </div>
              )}

              {/* Panel de edición del flujo */}
              {editFlujo && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-semibold text-amber-800">Editar flujo de trabajo</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Horas planificadas</label>
                      <input type="number" className="input" value={editHorasPlan}
                        onChange={e => setEditHorasPlan(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="label">Notas</label>
                      <input className="input" value={editNotas}
                        onChange={e => setEditNotas(e.target.value)} placeholder="Opcional..." />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditFlujo(false)} className="btn-secondary flex-1 text-sm">Cancelar</button>
                    <button onClick={handleEditFlujo} disabled={saving} className="btn-primary flex-1 text-sm">
                      {saving ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                  </div>
                </div>
              )}

              {/* Resumen del flujo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Horas plan',   val: `${flujoActual.TotalHorasPlan}h`,      css: 'text-brand-700' },
                  { label: 'H. estimadas', val: `${totalEst}h`,                         css: 'text-gray-700' },
                  { label: 'H. reales',    val: `${totalReal}h`,                        css: 'text-emerald-700' },
                  { label: 'Progreso',     val: totalActs ? `${completadas}/${totalActs} tareas` : '0 tareas', css: 'text-amber-700' },
                ].map(k => (
                  <div key={k.label} className="card py-3 text-center">
                    <p className={`text-lg font-bold ${k.css}`}>{k.val}</p>
                    <p className="text-xs text-gray-500">{k.label}</p>
                  </div>
                ))}
              </div>

              {/* Barra de progreso */}
              {totalActs > 0 && (
                <div className="card py-3">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                    <span>Progreso general</span>
                    <span className="font-medium">{Math.round(completadas / totalActs * 100)}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${Math.round(completadas / totalActs * 100)}%` }} />
                  </div>
                </div>
              )}

              {/* Actividades por día */}
              <div className="space-y-4">
                {DIAS_SEMANA.map((dia, i) => {
                  const fechaDia = addDays(semana, i)
                  const now = new Date()
                  const todayUtc = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}-${String(now.getUTCDate()).padStart(2,'0')}`
                  const esHoy = fechaDia === todayUtc
                  const acts = actsByDia[dia]
                  return (
                    <div key={dia}>
                      <div className={`flex items-center gap-2 mb-2 ${esHoy ? 'text-brand-700' : 'text-gray-700'}`}>
                        <span className={`text-sm font-bold ${esHoy ? 'text-brand-700' : 'text-gray-700'}`}>{dia}</span>
                        <span className="text-xs text-gray-400">{fmt.date(fechaDia)}</span>
                        {esHoy && <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">Hoy</span>}
                        <div className="flex-1 h-px bg-gray-100 ml-2" />
                        {isAdmin && (
                          <button onClick={() => setShowNuevaAct(showNuevaAct === `${flujoActual.ID}-${dia}` ? null : `${flujoActual.ID}-${dia}`)}
                            className="text-xs text-brand-600 hover:text-brand-800 flex items-center gap-1">
                            <Plus size={14} /> Agregar
                          </button>
                        )}
                      </div>

                      {showNuevaAct === `${flujoActual.ID}-${dia}` && (
                        <NuevaActividadForm
                          flujoId={flujoActual.ID}
                          username={targetUser}
                          onSave={() => { setShowNuevaAct(null); load() }}
                          onCancel={() => setShowNuevaAct(null)}
                        />
                      )}

                      {acts.length === 0 ? (
                        <p className="text-xs text-gray-300 italic pl-2">Sin actividades para este día</p>
                      ) : (
                        <div className="space-y-2">
                          {acts.map(act => (
                            <ActividadCard
                              key={act.ID}
                              act={act}
                              isAdmin={isAdmin}
                              onUpdate={handleUpdateAct}
                              onDelete={setConfirmDel}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Admin: agregar actividad global */}
              {isAdmin && (
                <div className="flex justify-center pt-2">
                  <button onClick={() => setShowNuevaAct(showNuevaAct === 'global' ? null : 'global')}
                    className="btn-secondary text-sm flex items-center gap-2">
                    <Plus size={16} /> Agregar actividad al flujo
                  </button>
                </div>
              )}
              {showNuevaAct === 'global' && (
                <NuevaActividadForm
                  flujoId={flujoActual.ID}
                  username={targetUser}
                  onSave={() => { setShowNuevaAct(null); load() }}
                  onCancel={() => setShowNuevaAct(null)}
                />
              )}
            </>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!confirmDel} onClose={() => setConfirmDel(null)} onConfirm={handleDeleteAct}
        loading={deleting} title="Eliminar Actividad"
        message={`¿Eliminar la actividad "${confirmDel?.Titulo}"?`}
      />

      <ConfirmDialog
        open={confirmDelFlujo} onClose={() => setConfirmDelFlujo(false)} onConfirm={handleDeleteFlujo}
        loading={deleting} title="Eliminar Flujo Semanal"
        message={`¿Eliminar el flujo completo de la semana ${semanaLabel}? Se eliminarán también todas sus actividades. Esta acción no se puede deshacer.`}
      />
    </div>
  )
}
