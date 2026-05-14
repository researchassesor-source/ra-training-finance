import { useEffect, useState, useCallback } from 'react'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { fmt } from '../../utils/formatters'
import { LogIn, LogOut, Clock, Calendar, User, ChevronLeft, ChevronRight } from 'lucide-react'
import TableSkeleton from '../UI/TableSkeleton'

function getMondayOf(date) {
  const d = date ? new Date(date) : new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function addDays(dateStr, n) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function formatHora(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  return d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })
}

function formatHoras(h) {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${hh}h ${mm.toString().padStart(2, '0')}m`
}

function ClockWidget({ estadoActual, onTimbrar, loading }) {
  const dentroAhora = estadoActual === 'entrada'
  return (
    <div className={`card border-l-4 ${dentroAhora ? 'border-emerald-500' : 'border-gray-300'}`}>
      <div className="flex items-center gap-4">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0
          ${dentroAhora ? 'bg-emerald-100' : 'bg-gray-100'}`}>
          {dentroAhora
            ? <LogIn size={26} className="text-emerald-600" />
            : <LogOut size={26} className="text-gray-500" />}
        </div>
        <div className="flex-1">
          <p className="text-sm text-gray-500 font-medium">Estado actual</p>
          <p className={`text-lg font-bold ${dentroAhora ? 'text-emerald-700' : 'text-gray-600'}`}>
            {dentroAhora ? 'Dentro — trabajando' : 'Fuera — sin entrada activa'}
          </p>
          <p className="text-xs text-gray-400">{new Date().toLocaleDateString('es-EC', { weekday:'long', day:'numeric', month:'long' })}</p>
        </div>
        <button
          onClick={() => onTimbrar(dentroAhora ? 'salida' : 'entrada')}
          disabled={loading}
          className={`px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 flex-shrink-0
            ${dentroAhora
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}>
          {loading ? <Clock size={18} className="animate-spin" /> : (dentroAhora ? <LogOut size={18} /> : <LogIn size={18} />)}
          {loading ? 'Registrando...' : (dentroAhora ? 'Registrar Salida' : 'Registrar Entrada')}
        </button>
      </div>
    </div>
  )
}

export default function AsistenciaView() {
  const { isAdmin, user } = useAuth()
  const [semana, setSemana]           = useState(getMondayOf())
  const [resumen, setResumen]         = useState(null)
  const [historial, setHistorial]     = useState([])
  const [estadoActual, setEstadoActual] = useState(null)
  const [loading, setLoading]         = useState(true)
  const [timbLoading, setTimbLoading] = useState(false)
  const [error, setError]             = useState('')
  const [success, setSuccess]         = useState('')
  const [usuarioSel, setUsuarioSel]   = useState('')
  const [usuarios, setUsuarios]       = useState([])

  const targetUser = isAdmin && usuarioSel ? usuarioSel : (isAdmin ? '' : user?.username)

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
        setHistorial(hist.data || [])
        setEstadoActual(hist.estadoActual)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [semana, targetUser])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (isAdmin) {
      api.getUsuarios()
        .then(r => setUsuarios((r.data || []).filter(u => u.Activo === true || u.Activo === 'TRUE')))
        .catch(() => {})
    }
  }, [isAdmin])

  async function handleTimbrar(tipo) {
    setTimbLoading(true)
    setError('')
    setSuccess('')
    try {
      await api.registrarTimbrada(tipo)
      setSuccess(tipo === 'entrada' ? '✅ Entrada registrada correctamente' : '✅ Salida registrada correctamente')
      setEstadoActual(tipo)
      load()
    } catch (e) { setError(e.message) }
    finally { setTimbLoading(false) }
  }

  const DIAS_SEMANA = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']
  const diasSemana = Array.from({ length: 7 }, (_, i) => addDays(semana, i))

  const semanaLabel = (() => {
    const lun = new Date(semana)
    const dom = new Date(semana); dom.setDate(dom.getDate() + 6)
    return `${lun.getDate()} – ${dom.getDate()} ${dom.toLocaleDateString('es-EC', { month: 'long', year: 'numeric' })}`
  })()

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Control de Asistencia</h2>
          <p className="text-sm text-gray-500">Registra tu entrada y salida diaria</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <select className="input w-auto text-sm" value={usuarioSel}
              onChange={e => setUsuarioSel(e.target.value)}>
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
          <button onClick={() => setSemana(getMondayOf())}
            className="btn-secondary text-sm">Hoy</button>
        </div>
      </div>

      {/* Timbrar — solo visible para el propio usuario (no admin viendo a otro) */}
      {!usuarioSel && (
        <ClockWidget estadoActual={estadoActual} onTimbrar={handleTimbrar} loading={timbLoading} />
      )}

      {error   && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
      {success && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg p-3">{success}</p>}

      {loading ? <TableSkeleton cols={4} rows={5} /> : (
        <>
          {/* Resumen semanal */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={18} className="text-brand-600" />
              <h3 className="font-semibold text-gray-900">Resumen de la semana</h3>
              <span className="ml-auto text-sm font-bold text-brand-700">
                Total: {resumen ? formatHoras(resumen.totalHoras) : '0h 00m'}
              </span>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {diasSemana.map((fecha, i) => {
                const diaData = resumen?.dias?.find(d => d.fecha === fecha)
                const esHoy = fecha === new Date().toISOString().slice(0, 10)
                return (
                  <div key={fecha} className={`rounded-xl p-3 text-center ${esHoy ? 'bg-brand-50 border border-brand-200' : 'bg-gray-50'}`}>
                    <p className={`text-xs font-semibold ${esHoy ? 'text-brand-700' : 'text-gray-500'}`}>{DIAS_SEMANA[i].slice(0, 3)}</p>
                    <p className={`text-xs mt-0.5 ${esHoy ? 'text-brand-500' : 'text-gray-400'}`}>
                      {new Date(fecha).getDate()}
                    </p>
                    <p className={`text-sm font-bold mt-1 ${diaData?.horas > 0 ? 'text-emerald-700' : 'text-gray-300'}`}>
                      {diaData ? formatHoras(diaData.horas) : '—'}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Historial de timbradas de la semana */}
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <Calendar size={16} className="text-gray-500" />
              <h3 className="font-semibold text-gray-900 text-sm">Timbradas de la semana</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Fecha','Hora','Tipo','Notas'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historial.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-8 text-gray-400">Sin timbradas registradas esta semana</td></tr>
                  ) : historial.map(t => (
                    <tr key={t.ID} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">{fmt.date(t.Fecha)}</td>
                      <td className="px-4 py-3 font-mono text-sm">{formatHora(t.Timestamp)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold
                          ${t.Tipo === 'entrada' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                          {t.Tipo === 'entrada' ? <LogIn size={12} /> : <LogOut size={12} />}
                          {t.Tipo === 'entrada' ? 'Entrada' : 'Salida'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{t.Notas || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
