import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, LineChart, Line, ResponsiveContainer,
} from 'recharts'
import { api } from '../../services/api'
import { fmt, MESES } from '../../utils/formatters'
import Spinner from '../UI/Spinner'
import {
  TrendingUp, TrendingDown, DollarSign, FileText,
  Clock, BarChart2, AlertCircle, CreditCard, ArrowUpCircle, ArrowDownCircle, Scale,
  Award, BadgeCheck, ShieldAlert, UsersRound,
} from 'lucide-react'

const PIE_COLORS = ['#4338ca','#0891b2','#059669','#d97706','#dc2626','#7c3aed','#db2777','#0284c7']

const TOOLTIP_STYLE = {
  contentStyle: { borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 },
  labelStyle: { fontWeight: 600 },
}

function KpiCard({ icon: Icon, label, value, sub, color = 'brand' }) {
  const colors = {
    brand:   'bg-brand-50 text-brand-700',
    green:   'bg-emerald-50 text-emerald-700',
    red:     'bg-red-50 text-red-700',
    amber:   'bg-amber-50 text-amber-700',
    blue:    'bg-blue-50 text-blue-700',
    purple:  'bg-purple-50 text-purple-700',
  }
  return (
    <div className="card flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${colors[color]}`}>
        <Icon size={22} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-gray-900 mt-0.5 truncate">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [year, setYear]       = useState(new Date().getFullYear())

  useEffect(() => {
    setLoading(true)
    api.getDashboard(year)
      .then(r => setData(r.data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [year])

  if (loading) return <Spinner text="Cargando dashboard..." />
  if (error)   return (
    <div className="card flex items-center gap-3 text-red-700">
      <AlertCircle size={20} /> <span>{error}</span>
    </div>
  )
  if (!data)   return null

  const { kpis, ingresosXMes, pagosXMes, categorias, recentIngresos, recentEgresos, recentPagos, proyeccionesFuturas } = data

  // Salidas = solo pagos completados (dinero real salido)
  const salidasTotal = kpis.totalPagosEjecutados || 0
  const balanceReal  = kpis.balance

  const monthlyChartData = MESES.map((mes, i) => ({
    mes,
    'Ingresos confirmados': ingresosXMes[i]?.total || 0,
    'Pagos ejecutados':     pagosXMes?.[i]?.total  || 0,
    'Balance':  (ingresosXMes[i]?.total || 0) - (pagosXMes?.[i]?.total || 0),
  }))

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  return (
    <div className="space-y-6">
      {/* Year selector */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Dashboard financiero — año fiscal</p>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className="input w-32">
          {years.map(y => <option key={y}>{y}</option>)}
        </select>
      </div>

      {/* ── FLUJO FINANCIERO PRINCIPAL ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* ENTRADAS */}
        <div className="card border-l-4 border-emerald-500">
          <div className="flex items-center gap-2 mb-2">
            <ArrowUpCircle size={20} className="text-emerald-600" />
            <span className="text-sm font-bold text-emerald-700 uppercase tracking-wide">Entradas</span>
          </div>
          <p className="text-3xl font-bold text-emerald-700">{fmt.usd(kpis.totalIngresos)}</p>
          <p className="text-xs text-gray-500 mt-1">Pagos confirmados de clientes</p>
          {(kpis.ingPendientes || 0) > 0 && (
            <div className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
              ⚠ {kpis.ingPendientes} ingreso{kpis.ingPendientes > 1 ? 's' : ''} por verificar
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1 text-xs text-gray-500">
            <p>Cursos / Talleres / Eventos</p>
            <p>Certificaciones / Suscripciones</p>
            <p>Contratos corporativos</p>
          </div>
        </div>

        {/* SALIDAS */}
        <div className="card border-l-4 border-red-500">
          <div className="flex items-center gap-2 mb-2">
            <ArrowDownCircle size={20} className="text-red-600" />
            <span className="text-sm font-bold text-red-700 uppercase tracking-wide">Salidas Ejecutadas</span>
          </div>
          <p className="text-3xl font-bold text-red-700">{fmt.usd(salidasTotal)}</p>
          <p className="text-xs text-gray-500 mt-1">Pagos efectivamente realizados</p>
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5 text-xs">
            {(kpis.egresosAprobados || 0) > 0 && (
              <div className="flex justify-between text-amber-700 bg-amber-50 rounded px-2 py-1">
                <span>Aprobados (pendientes de pago)</span>
                <span className="font-medium">{kpis.egresosAprobados}</span>
              </div>
            )}
            {(kpis.egresosPendientes || 0) > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>En revisión / pendientes</span>
                <span className="font-medium">{kpis.egresosPendientes}</span>
              </div>
            )}
            {(kpis.egresosAprobados || 0) === 0 && (kpis.egresosPendientes || 0) === 0 && (
              <p className="text-gray-400 italic">Sin egresos comprometidos</p>
            )}
          </div>
        </div>

        {/* BALANCE */}
        <div className={`card border-l-4 ${balanceReal >= 0 ? 'border-brand-500' : 'border-red-500'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Scale size={20} className={balanceReal >= 0 ? 'text-brand-600' : 'text-red-600'} />
            <span className={`text-sm font-bold uppercase tracking-wide ${balanceReal >= 0 ? 'text-brand-700' : 'text-red-700'}`}>
              Balance Neto
            </span>
          </div>
          <p className={`text-3xl font-bold ${balanceReal >= 0 ? 'text-brand-700' : 'text-red-700'}`}>
            {fmt.usd(balanceReal)}
          </p>
          <p className="text-xs text-gray-500 mt-1">Entradas − Salidas</p>
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${balanceReal >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <span className="text-xs text-gray-600">
                {balanceReal >= 0
                  ? `Margen: ${kpis.totalIngresos > 0 ? ((balanceReal / kpis.totalIngresos) * 100).toFixed(1) : 0}% sobre ingresos`
                  : 'Déficit — egresos superan ingresos'}
              </span>
            </div>
            <div className="mt-2">
              <p className="text-xs text-gray-400">Ing. proyectado adicional</p>
              <p className="text-sm font-semibold text-purple-700">{fmt.usd(kpis.totalProyectado)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs secundarios */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={FileText}   label="Contratos Activos"    value={kpis.contratosActivos}                  color="blue"   />
        <KpiCard icon={Clock}      label="Egresos Pendientes"   value={kpis.egresosPendientes}                 color="amber"  sub="Esperan aprobación" />
        <KpiCard icon={CreditCard} label="Egresos Aprobados"    value={kpis.egresosAprobados || 0}             color="red"    sub="Comprometidos, aún no pagados" />
        <KpiCard icon={BarChart2}  label="Ing. Proyectado"      value={fmt.usd(kpis.totalProyectado)}          color="purple" sub="Eventos futuros" />
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700">Inscripciones y certificados</h2>
          <p className="text-xs text-gray-500">Estado operativo del año seleccionado</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard icon={UsersRound} label="Inscripciones" value={kpis.inscripciones || 0} color="blue" />
          <KpiCard icon={Award} label="R.A. por emitir" value={kpis.certificadosRaPendientes || 0} color="amber" sub="Aval propio" />
          <KpiCard icon={ShieldAlert} label="Aval institucional pendiente" value={kpis.certificadosAvalPendientes || 0} color="purple" />
          <KpiCard icon={BadgeCheck} label="Certificados emitidos" value={kpis.certificadosEmitidos || 0} color="green" />
        </div>
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="card xl:col-span-2">
          <h3 className="font-semibold text-gray-900 mb-4 text-sm">Entradas vs Salidas por Mes</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={monthlyChartData} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip {...TOOLTIP_STYLE} formatter={v => fmt.usd(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Ingresos confirmados" fill="#059669" radius={[4,4,0,0]} />
              <Bar dataKey="Pagos ejecutados"     fill="#dc2626" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4 text-sm">Distribución de Salidas</h3>
          {categorias.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={categorias} dataKey="total" nameKey="nombre"
                  cx="50%" cy="50%" outerRadius={85}
                  label={({ nombre, percent }) => `${nombre.slice(0,10)} ${(percent*100).toFixed(0)}%`}
                  labelLine={false}>
                  {categorias.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => fmt.usd(v)} {...TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Balance line + projections */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4 text-sm">Flujo de Balance Mensual</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={monthlyChartData} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip {...TOOLTIP_STYLE} formatter={v => fmt.usd(v)} />
              <Line type="monotone" dataKey="Balance" stroke="#4338ca" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-3 text-sm">Próximas Proyecciones</h3>
          {proyeccionesFuturas.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Sin proyecciones registradas</p>
          ) : (
            <div className="space-y-2">
              {proyeccionesFuturas.map(p => (
                <div key={p.ID} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{p.Evento}</p>
                    <p className="text-xs text-gray-500">{p.Tipo} · {fmt.date(p.FechaEstimada)}</p>
                  </div>
                  <p className="text-sm font-bold text-brand-700">{fmt.usd(p.MontoProyectado)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-3 text-sm flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Últimos Ingresos
          </h3>
          {recentIngresos.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sin ingresos recientes</p>
          ) : (
            <div className="space-y-2">
              {recentIngresos.map(i => (
                <div key={i.ID} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900 truncate">{i.Concepto}</p>
                    <p className="text-xs text-gray-400">{i.CreadoPor} · {fmt.date(i.Fecha)}</p>
                  </div>
                  <span className="text-sm font-bold text-emerald-600 ml-2 flex-shrink-0">{fmt.usd(i.Monto)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-3 text-sm flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Últimos Egresos
          </h3>
          {recentEgresos.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sin egresos recientes</p>
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
                    <span className={`text-xs ${e.Estado === 'aprobado' ? 'badge-green' : e.Estado === 'pendiente' ? 'badge-yellow' : 'badge-red'}`}>{e.Estado}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-3 text-sm flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Últimos Pagos a Proveedores
          </h3>
          {!recentPagos || recentPagos.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sin pagos recientes</p>
          ) : (
            <div className="space-y-2">
              {recentPagos.map(p => (
                <div key={p.ID} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900 truncate">{p.Concepto}</p>
                    <p className="text-xs text-gray-400">{p.Beneficiario} · {fmt.date(p.Fecha)}</p>
                  </div>
                  <span className="text-sm font-bold text-amber-600 ml-2 flex-shrink-0">{fmt.usd(p.Monto)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
