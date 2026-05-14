import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { api } from '../../services/api'
import { fmt, ESTADOS_INGRESO, ESTADOS_EGRESO } from '../../utils/formatters'
import {
  TrendingUp, TrendingDown, GraduationCap,
  Clock, CheckCircle, AlertCircle, LogIn, LogOut,
} from 'lucide-react'

function StatCard({ icon: Icon, label, value, sub, color = 'brand' }) {
  const colors = {
    brand:   'bg-brand-50 text-brand-700',
    green:   'bg-emerald-50 text-emerald-700',
    red:     'bg-red-50 text-red-700',
    amber:   'bg-amber-50 text-amber-700',
    blue:    'bg-blue-50 text-blue-700',
  }
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${colors[color]}`}>
        <Icon size={22} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-gray-900 truncate">{value}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  )
}

export default function UserDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [ingresos, setIngresos]         = useState([])
  const [egresos, setEgresos]           = useState([])
  const [inscripciones, setInscrip]     = useState([])
  const [loading, setLoading]           = useState(true)
  const [estadoTimbrada, setEstadoTim]  = useState(null)
  const [timbLoading, setTimbLoading]   = useState(false)
  const [timbMsg, setTimbMsg]           = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.getIngresos({}),
      api.getEgresos({}),
      api.getInscripciones({}),
      api.getAsistencia({}),
    ])
      .then(([i, e, ins, as]) => {
        setIngresos(i.data || [])
        setEgresos(e.data || [])
        setInscrip(ins.data || [])
        setEstadoTim(as.estadoActual)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function timbrar(tipo) {
    setTimbLoading(true)
    setTimbMsg('')
    try {
      await api.registrarTimbrada(tipo)
      setEstadoTim(tipo)
      setTimbMsg(tipo === 'entrada' ? '✅ Entrada registrada' : '✅ Salida registrada')
      setTimeout(() => setTimbMsg(''), 3000)
    } catch (e) { setTimbMsg('⚠ ' + e.message) }
    finally { setTimbLoading(false) }
  }

  const sum = (arr, f) => arr.reduce((s, r) => s + (Number(r[f]) || 0), 0)

  const ingConfirmados = ingresos.filter(i => i.Estado === 'confirmado')
  const ingPendientes  = ingresos.filter(i => i.Estado === 'pendiente' || i.Estado === 'pendiente_verificacion')
  const egrPendientes  = egresos.filter(e => e.Estado === 'pendiente')
  const egrAprobados   = egresos.filter(e => e.Estado === 'aprobado')

  const recentIngresos = [...ingresos]
    .sort((a, b) => new Date(b.FechaCreacion) - new Date(a.FechaCreacion))
    .slice(0, 5)
  const recentEgresos = [...egresos]
    .sort((a, b) => new Date(b.FechaCreacion) - new Date(a.FechaCreacion))
    .slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Welcome + Timbrada rápida */}
      <div className="card bg-gradient-to-r from-brand-600 to-brand-800 text-white">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold">Bienvenido, {user?.nombre} 👋</h2>
            <p className="text-brand-200 text-sm mt-1">Resumen de tu actividad registrada</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={() => timbrar(estadoTimbrada === 'entrada' ? 'salida' : 'entrada')}
              disabled={timbLoading}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all
                ${estadoTimbrada === 'entrada'
                  ? 'bg-red-500 hover:bg-red-400 text-white'
                  : 'bg-white/20 hover:bg-white/30 text-white border border-white/30'}`}>
              {timbLoading
                ? <Clock size={16} className="animate-spin" />
                : estadoTimbrada === 'entrada' ? <LogOut size={16} /> : <LogIn size={16} />}
              {timbLoading ? '...' : estadoTimbrada === 'entrada' ? 'Registrar Salida' : 'Registrar Entrada'}
            </button>
            {timbMsg && <p className="text-xs text-brand-200">{timbMsg}</p>}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({length: 4}).map((_,i) => (
            <div key={i} className="card animate-pulse h-20 bg-gray-50" />
          ))}
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={TrendingUp}    label="Ingresos confirmados" value={fmt.usd(sum(ingConfirmados,'Monto'))} color="green" sub={`${ingConfirmados.length} registros`} />
            <StatCard icon={Clock}         label="Por verificar"        value={ingPendientes.length}  color="amber" sub="Ingresos pendientes" />
            <StatCard icon={TrendingDown}  label="Gastos reportados"    value={fmt.usd(sum(egresos,'Monto'))} color="red" sub={`${egresos.length} registros`} />
            <StatCard icon={GraduationCap} label="Inscripciones"        value={inscripciones.length}  color="blue" sub="registradas" />
          </div>

          {/* Alerts */}
          {ingPendientes.length > 0 && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  {ingPendientes.length} ingreso{ingPendientes.length > 1 ? 's' : ''} pendiente{ingPendientes.length > 1 ? 's' : ''} de verificación
                </p>
                <p className="text-xs text-amber-600 mt-0.5">El administrador debe confirmar la transacción.</p>
              </div>
              <button onClick={() => navigate('/mis-ingresos')} className="ml-auto text-xs font-medium text-amber-700 hover:text-amber-900 whitespace-nowrap">Ver →</button>
            </div>
          )}
          {egrPendientes.length > 0 && (
            <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
              <Clock size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-800">
                  {egrPendientes.length} gasto{egrPendientes.length > 1 ? 's' : ''} esperando aprobación
                </p>
                <p className="text-xs text-blue-600 mt-0.5">Monto: {fmt.usd(sum(egrPendientes,'Monto'))}</p>
              </div>
              <button onClick={() => navigate('/mis-egresos')} className="ml-auto text-xs font-medium text-blue-700 hover:text-blue-900 whitespace-nowrap">Ver →</button>
            </div>
          )}

          {/* Recent activity */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 text-sm">Últimos Ingresos</h3>
                <button onClick={() => navigate('/mis-ingresos')} className="text-xs text-brand-600 hover:text-brand-800">Ver todos →</button>
              </div>
              {recentIngresos.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Sin ingresos registrados</p>
              ) : (
                <div className="space-y-2">
                  {recentIngresos.map(i => (
                    <div key={i.ID} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-900 truncate">{i.Concepto}</p>
                        <p className="text-xs text-gray-400">{i.Tipo} · {fmt.date(i.Fecha)}</p>
                      </div>
                      <div className="ml-2 text-right flex-shrink-0">
                        <p className="text-sm font-bold text-emerald-600">{fmt.usd(i.Monto)}</p>
                        <span className={`text-[10px] ${ESTADOS_INGRESO[i.Estado]?.css || 'badge-gray'}`}>
                          {ESTADOS_INGRESO[i.Estado]?.label || i.Estado}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 text-sm">Últimos Gastos</h3>
                <button onClick={() => navigate('/mis-egresos')} className="text-xs text-brand-600 hover:text-brand-800">Ver todos →</button>
              </div>
              {recentEgresos.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Sin gastos registrados</p>
              ) : (
                <div className="space-y-2">
                  {recentEgresos.map(e => (
                    <div key={e.ID} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-900 truncate">{e.Concepto}</p>
                        <p className="text-xs text-gray-400">{e.Categoria} · {fmt.date(e.Fecha)}</p>
                      </div>
                      <div className="ml-2 text-right flex-shrink-0">
                        <p className="text-sm font-bold text-red-600">{fmt.usd(e.Monto)}</p>
                        <span className={`text-[10px] ${ESTADOS_EGRESO[e.Estado]?.css || 'badge-gray'}`}>
                          {ESTADOS_EGRESO[e.Estado]?.label || e.Estado}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Reportar Ingreso', sub: 'Registrar pago de cliente', icon: TrendingUp,    path: '/mis-ingresos', color: 'text-emerald-600', bg: 'bg-emerald-50 group-hover:bg-emerald-100' },
              { label: 'Reportar Gasto',   sub: 'Enviar gasto a aprobación', icon: TrendingDown,  path: '/mis-egresos',  color: 'text-red-600',     bg: 'bg-red-50 group-hover:bg-red-100'         },
              { label: 'Inscripciones',    sub: 'Registrar participantes',   icon: GraduationCap, path: '/inscripciones',color: 'text-brand-600',   bg: 'bg-brand-50 group-hover:bg-brand-100'     },
              { label: 'Mi Asistencia',    sub: 'Historial de entradas/salidas', icon: Clock,     path: '/asistencia',   color: 'text-amber-600',   bg: 'bg-amber-50 group-hover:bg-amber-100'     },
              { label: 'Plan Semanal',     sub: 'Ver mis actividades',       icon: CheckCircle,   path: '/flujos',       color: 'text-purple-600',  bg: 'bg-purple-50 group-hover:bg-purple-100'   },
            ].map(a => (
              <button key={a.path} onClick={() => navigate(a.path)}
                className="card hover:shadow-md transition-all text-left group">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-colors ${a.bg}`}>
                  <a.icon size={20} className={a.color} />
                </div>
                <p className="font-semibold text-gray-900 text-sm">{a.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{a.sub}</p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
