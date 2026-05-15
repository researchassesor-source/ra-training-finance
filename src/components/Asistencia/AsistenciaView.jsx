import { useEffect, useState, useCallback } from 'react'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { fmt } from '../../utils/formatters'
import {
  LogIn, LogOut, Clock, Calendar, ChevronLeft, ChevronRight, Trash2, MessageSquare,
} from 'lucide-react'
import TableSkeleton from '../UI/TableSkeleton'
import ConfirmDialog from '../UI/ConfirmDialog'

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

function formatHora(isoStr) {
  if (!isoStr) return '—'
  return new Date(isoStr).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })
}

function formatHoras(h) {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${hh}h ${mm.toString().padStart(2, '0')}m`
}

// Devuelve la fecha local del navegador como YYYY-MM-DD.
// El backend también usa la hora local Ecuador, así que deben coincidir.
function localToday() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
}

// ── ClockWidget ─────────────────────────────────────────────
function ClockWidget({ estadoActual, entradaTimestamp, onTimbrar, loading }) {
  const dentroAhora = estadoActual === 'entrada'
  const [showNotas, setShowNotas] = useState(false)
  const [notas, setNotas]         = useState('')

  function handleClick() {
    if (showNotas) return
    setShowNotas(true)
  }

  async function confirmar() {
    await onTimbrar(dentroAhora ? 'salida' : 'entrada', notas)
    setNotas('')
    setShowNotas(false)
  }

  return (
    <div className={`card border-l-4 ${dentroAhora ? 'border-emerald-500' : 'border-gray-300'}`}>
      <div className="flex items-start gap-4 flex-wrap">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0
          ${dentroAhora ? 'bg-emerald-100' : 'bg-gray-100'}`}>
          {dentroAhora ? <LogIn size={26} className="text-emerald-600" /> : <LogOut size={26} className="text-gray-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-500 font-medium">Estado actual</p>
          <p className={`text-lg font-bold ${dentroAhora ? 'text-emerald-700' : 'text-gray-600'}`}>
            {dentroAhora ? 'Dentro — trabajando' : 'Fuera — sin entrada activa'}
          </p>
          {dentroAhora && entradaTimestamp && (
            <p className="text-xs text-emerald-600 mt-0.5">
              Entrada registrada a las {formatHora(entradaTimestamp)}
            </p>
          )}
          <p className="text-xs text-gray-400">{new Date().toLocaleDateString('es-EC', { weekday:'long', day:'numeric', month:'long' })}</p>
        </div>
        {!showNotas && (
          <button
            onClick={handleClick}
            disabled={loading}
            className={`px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 flex-shrink-0
              ${dentroAhora ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>
            {loading ? <Clock size={18} className="animate-spin" /> : (dentroAhora ? <LogOut size={18} /> : <LogIn size={18} />)}
            {loading ? 'Registrando...' : (dentroAhora ? 'Registrar Salida' : 'Registrar Entrada')}
          </button>
        )}
      </div>
      {showNotas && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
          <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <MessageSquare size={16} className="text-gray-400" />
            ¿Alguna nota? <span className="font-normal text-gray-400">(opcional)</span>
          </p>
          <textarea
            className="input text-sm"
            rows={2}
            placeholder="Ej: Trabajé desde casa, llegué tarde por tráfico..."
            value={notas}
            onChange={e => setNotas(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
            <button onClick={() => setShowNotas(false)} className="btn-secondary flex-1 text-sm">Cancelar</button>
            <button onClick={confirmar} disabled={loading}
              className={`flex-1 text-sm font-bold rounded-xl py-2.5 flex items-center justify-center gap-2 transition-all
                ${dentroAhora ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>
              {loading ? <Clock size={16} className="animate-spin" /> : (dentroAhora ? <LogOut size={16} /> : <LogIn size={16} />)}
              {loading ? 'Registrando...' : (dentroAhora ? 'Confirmar Salida' : 'Confirmar Entrada')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main View ────────────────────────────────────────────────
export default function AsistenciaView() {
  const { isAdmin, user } = useAuth()
  const [semana, setSemana]             = useState(getMondayOf())
  const [resumen, setResumen]           = useState(null)
  const [historial, setHistorial]       = useState([])
  const [estadoActual, setEstadoActual] = useState(null)
  const [entradaTs, setEntradaTs]       = useState(null) // timestamp de la entrada activa
  const [loading, setLoading]           = useState(true)
  const [timbLoading, setTimbLoading]   = useState(false)
  const [error, setError]               = useState('')
  const [success, setSuccess]           = useState('')
  const [usuarioSel, setUsuarioSel]     = useState('')
  const [usuarios, setUsuarios]         = useState([])
  const [diaFiltro, setDiaFiltro]       = useState(null)  // fecha YYYY-MM-DD | null = todo
  const [confirmDel, setConfirmDel]     = useState(null)  // { id, label }
  const [deleting, setDeleting]         = useState(false)

  const targetUser = isAdmin && usuarioSel ? usuarioSel : (isAdmin ? '' : user?.username)

  // Carga el resumen semanal e historial para la semana visible.
  // NO toca estadoActual cuando se ve una semana que no contiene hoy.
  const load = useCallback(() => {
    setLoading(true)
    setError('')
    const params = { semana, ...(targetUser ? { username: targetUser } : {}) }
    Promise.all([
      api.getResumenSemanal(params),
      api.getAsistencia({ ...params, desde: semana, hasta: addDays(semana, 6) }),
    ])
      .then(([res, hist]) => {
        setResumen(res.data)
        const timbradas = hist.data || []
        setHistorial(timbradas)
        // Solo actualizar estadoActual cuando la semana visible contiene hoy
        const hoy = localToday()
        if (hoy >= semana && hoy <= addDays(semana, 6)) {
          setEstadoActual(hist.estadoActual)
          const deHoy = timbradas.filter(t => t.Fecha === hoy)
            .sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp))
          setEntradaTs(deHoy[0]?.Tipo === 'entrada' ? deHoy[0].Timestamp : null)
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [semana, targetUser])

  useEffect(() => { load() }, [load])

  // Carga dedicada del estado actual — independiente de la semana visible.
  // Se ejecuta solo cuando cambia el usuario objetivo (no cuando navega semanas).
  useEffect(() => {
    const params = targetUser ? { username: targetUser } : {}
    api.getAsistencia(params)   // sin filtro de fecha = retorna estadoActual real
      .then(res => {
        setEstadoActual(res.estadoActual)
        const hoy = localToday()
        const deHoy = (res.data || [])
          .filter(t => t.Fecha === hoy)
          .sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp))
        setEntradaTs(deHoy[0]?.Tipo === 'entrada' ? deHoy[0].Timestamp : null)
      })
      .catch(() => {})
  }, [targetUser])

  useEffect(() => {
    if (isAdmin) {
      api.getUsuarios()
        .then(r => setUsuarios((r.data || []).filter(u => u.Activo === true || u.Activo === 'TRUE')))
        .catch(() => {})
    }
  }, [isAdmin])

  async function handleTimbrar(tipo, notas = '') {
    setTimbLoading(true)
    setError('')
    setSuccess('')
    try {
      await api.registrarTimbrada(tipo, notas)
      setSuccess(tipo === 'entrada' ? '✅ Entrada registrada correctamente' : '✅ Salida registrada correctamente')
      setEstadoActual(tipo)
      if (tipo === 'entrada') setEntradaTs(new Date().toISOString())
      else setEntradaTs(null)
      load()
      setTimeout(() => setSuccess(''), 5000)
    } catch (e) { setError(e.message) }
    finally { setTimbLoading(false) }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.deleteTimbrada(confirmDel.id)
      setConfirmDel(null)
      load()
    } catch (e) { setError(e.message) }
    finally { setDeleting(false) }
  }

  const DIAS_SEMANA = ['Lun','Mar','Mié','Jue','Vie']
  const diasSemana  = Array.from({ length: 5 }, (_, i) => addDays(semana, i))

  const semanaLabel = (() => {
    const lun = new Date(semana + 'T12:00:00Z')
    const vie = new Date(semana + 'T12:00:00Z')
    vie.setUTCDate(vie.getUTCDate() + 4)
    return `${lun.getUTCDate()} – ${vie.getUTCDate()} ${vie.toLocaleDateString('es-EC', { month: 'long', year: 'numeric' })}`
  })()

  // Historial filtrado por día seleccionado
  const histFiltrado = diaFiltro
    ? historial.filter(t => t.Fecha === diaFiltro)
    : historial

  const esPropioUsuario = !usuarioSel // Admin viendo su propio registro, o vendedor

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Control de Asistencia</h2>
          <p className="text-sm text-gray-500">
            {usuarioSel ? `Viendo registros de ${usuarios.find(u => u.Username === usuarioSel)?.Nombre || usuarioSel}` : 'Tu registro de entrada/salida'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <select className="input w-auto text-sm" value={usuarioSel}
              onChange={e => { setUsuarioSel(e.target.value); setDiaFiltro(null) }}>
              <option value="">Mi registro</option>
              {usuarios.map(u => <option key={u.ID} value={u.Username}>{u.Nombre} ({u.Username})</option>)}
            </select>
          )}
          <button onClick={() => setSemana(s => addDays(s, -7))}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-medium text-gray-700 whitespace-nowrap px-2">{semanaLabel}</span>
          <button onClick={() => setSemana(s => addDays(s, 7))}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
            <ChevronRight size={18} />
          </button>
          <button onClick={() => { setSemana(getMondayOf()); setDiaFiltro(null) }}
            className="btn-secondary text-sm">Hoy</button>
        </div>
      </div>

      {/* ClockWidget — solo visible para el propio usuario */}
      {esPropioUsuario && (
        <ClockWidget
          estadoActual={estadoActual}
          entradaTimestamp={entradaTs}
          onTimbrar={handleTimbrar}
          loading={timbLoading}
        />
      )}

      {error   && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
      {success && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg p-3">{success}</p>}

      {loading ? <TableSkeleton cols={4} rows={5} /> : (
        <>
          {/* Resumen semanal + selector de día */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={18} className="text-brand-600" />
              <h3 className="font-semibold text-gray-900">Resumen de la semana</h3>
              <span className="ml-auto text-sm font-bold text-brand-700">
                Total: {resumen ? formatHoras(resumen.totalHoras) : '0h 00m'}
              </span>
              {diaFiltro && (
                <button onClick={() => setDiaFiltro(null)}
                  className="text-xs text-gray-500 hover:text-gray-700 underline ml-2">Ver todos</button>
              )}
            </div>
            <div className="grid grid-cols-5 gap-2">
              {diasSemana.map((fecha, i) => {
                const diaData = resumen?.dias?.find(d => d.fecha === fecha)
                const todayUtc = localToday()
                const esHoy    = fecha === todayUtc
                const seleccionado = diaFiltro === fecha
                return (
                  <button key={fecha}
                    onClick={() => setDiaFiltro(seleccionado ? null : fecha)}
                    className={`rounded-xl p-3 text-center transition-all border-2 ${
                      seleccionado ? 'border-brand-500 bg-brand-50' :
                      esHoy ? 'border-brand-200 bg-brand-50' :
                      'border-transparent bg-gray-50 hover:bg-gray-100'
                    }`}>
                    <p className={`text-xs font-semibold ${esHoy || seleccionado ? 'text-brand-700' : 'text-gray-500'}`}>
                      {DIAS_SEMANA[i]}
                    </p>
                    <p className={`text-xs mt-0.5 ${esHoy || seleccionado ? 'text-brand-500' : 'text-gray-400'}`}>
                      {new Date(fecha + 'T12:00:00Z').getUTCDate()}
                    </p>
                    <p className={`text-sm font-bold mt-1 ${diaData?.horas > 0 ? 'text-emerald-700' : 'text-gray-300'}`}>
                      {diaData ? formatHoras(diaData.horas) : '—'}
                    </p>
                    {diaData?.registros?.length > 0 && (
                      <p className="text-[10px] text-gray-400 mt-0.5">{diaData.registros.length} reg.</p>
                    )}
                  </button>
                )
              })}
            </div>
            {diaFiltro && (
              <p className="text-xs text-center text-brand-600 mt-3 font-medium">
                Mostrando registros del {fmt.date(diaFiltro)} — haz clic en el día de nuevo para ver todos
              </p>
            )}
          </div>

          {/* Historial de timbradas */}
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <Calendar size={16} className="text-gray-500" />
              <h3 className="font-semibold text-gray-900 text-sm">
                {diaFiltro ? `Timbradas del ${fmt.date(diaFiltro)}` : 'Timbradas de la semana'}
              </h3>
              <span className="ml-auto text-xs text-gray-400">{histFiltrado.length} registro{histFiltrado.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Fecha','Hora','Tipo','Notas', ...(isAdmin ? [''] : [])].map((h, i) => (
                      <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {histFiltrado.length === 0 ? (
                    <tr>
                      <td colSpan={isAdmin ? 5 : 4} className="text-center py-8 text-gray-400">
                        Sin timbradas registradas{diaFiltro ? ' para este día' : ' esta semana'}
                      </td>
                    </tr>
                  ) : histFiltrado.map(t => (
                    <tr key={t.ID} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">{fmt.date(t.Fecha)}</td>
                      <td className="px-4 py-3 font-mono text-sm text-gray-700">{formatHora(t.Timestamp)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold
                          ${t.Tipo === 'entrada' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                          {t.Tipo === 'entrada' ? <LogIn size={12} /> : <LogOut size={12} />}
                          {t.Tipo === 'entrada' ? 'Entrada' : 'Salida'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-[160px] truncate">{t.Notas || '—'}</td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setConfirmDel({ id: t.ID, label: `${t.Tipo === 'entrada' ? 'Entrada' : 'Salida'} del ${fmt.date(t.Fecha)} a las ${formatHora(t.Timestamp)}` })}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Eliminar Registro"
        message={`¿Eliminar "${confirmDel?.label}"? Esta acción no se puede deshacer.`}
      />
    </div>
  )
}
