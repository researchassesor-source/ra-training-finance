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
  Clock, BarChart2, AlertCircle, CreditCard,
} from 'lucide-react'

const PIE_COLORS = ['#4338ca','#0891b2','#059669','#d97706','#dc2626','#7c3aed','#db2777','#0284c7']

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

const TOOLTIP_STYLE = {
  contentStyle: { borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 },
  labelStyle: { fontWeight: 600 },
}

export default function AdminDashboard() {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')
  const [year, setYear]     = useState(new Date().getFullYear())

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

  const { kpis, ingresosXMes, egresosXMes, pagosXMes, categorias, recentIngresos, recentEgresos, recentPagos, proyeccionesFuturas } = data

  const monthlyChartData = MESES.map((mes, i) => ({
    mes,
    Ingresos: ingresosXMes[i]?.total || 0,
    Egresos:  egresosXMes[i]?.total  || 0,
    Pagos:    pagosXMes?.[i]?.total  || 0,
    Balance:  (ingresosXMes[i]?.total || 0) - (egresosXMes[i]?.total || 0) - (pagosXMes?.[i]?.total || 0),
  }))

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  return (
    <div className="space-y-6">
      {/* Year selector */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Datos del año fiscal</p>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className="input w-32">
          {years.map(y => <option key={y}>{y}</option>)}
        </select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        <KpiCard icon={TrendingUp}   label="Total Ingresos"     value={fmt.usd(kpis.totalIngresos)}        color="green"  />
        <KpiCard icon={TrendingDown} label="Total Egresos"      value={fmt.usd(kpis.totalEgresos)}         color="red"    />
        <KpiCard icon={CreditCard}   label="Pagos Ejecutados"   value={fmt.usd(kpis.totalPagosEjecutados)} color="amber"  sub="Pagos completados" />
        <KpiCard icon={DollarSign}   label="Balance Neto"       value={fmt.usd(kpis.balance)}              color={kpis.balance >= 0 ? 'brand' : 'red'} />
        <KpiCard icon={FileText}     label="Contratos Activos"  value={kpis.contratosActivos}              color="blue"   />
        <KpiCard icon={Clock}        label="Egresos Pendientes" value={kpis.egresosPendientes}             color="amber"  sub="Esperan aprobación" />
        <KpiCard icon={BarChart2}    label="Ing. Proyectado"    value={fmt.usd(kpis.totalProyectado)}      color="purple" sub="Eventos futuros" />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Monthly bar chart */}
        <div className="card xl:col-span-2">
          <h3 className="font-semibold text-gray-900 mb-4 text-sm">Ingresos vs Egresos por Mes</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={monthlyChartData} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip {...TOOLTIP_STYLE} formatter={v => fmt.usd(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Ingresos" fill="#059669" radius={[4,4,0,0]} />
              <Bar dataKey="Egresos"  fill="#dc2626" radius={[4,4,0,0]} />
              <Bar dataKey="Pagos"    fill="#d97706" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie chart - egresos por categoría */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4 text-sm">Egresos por Categoría</h3>
          {categorias.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={categorias} dataKey="total" nameKey="nombre"
                  cx="50%" cy="50%" outerRadius={90} label={({ nombre, percent }) =>
                    `${nombre} ${(percent*100).toFixed(0)}%`
                  } labelLine={false}>
                  {categorias.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
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

        {/* Proyecciones */}
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
          <h3 className="font-semibold text-gray-900 mb-3 text-sm">Últimos Ingresos</h3>
          {recentIngresos.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sin ingresos recientes</p>
          ) : (
            <div className="space-y-2">
              {recentIngresos.map(i => (
                <div key={i.ID} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm text-gray-900">{i.Concepto}</p>
                    <p className="text-xs text-gray-400">{i.Tipo} · {fmt.date(i.Fecha)}</p>
                  </div>
                  <span className="text-sm font-bold text-emerald-600">{fmt.usd(i.Monto)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-3 text-sm">Últimos Egresos</h3>
          {recentEgresos.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sin egresos recientes</p>
          ) : (
            <div className="space-y-2">
              {recentEgresos.map(e => (
                <div key={e.ID} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm text-gray-900">{e.Concepto}</p>
                    <p className="text-xs text-gray-400">{e.Categoria} · {fmt.date(e.Fecha)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-red-600">{fmt.usd(e.Monto)}</p>
                    <span className={`text-xs ${e.Estado === 'aprobado' ? 'badge-green' : e.Estado === 'pendiente' ? 'badge-yellow' : 'badge-red'}`}>
                      {e.Estado}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-3 text-sm">Últimos Pagos</h3>
          {!recentPagos || recentPagos.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sin pagos recientes</p>
          ) : (
            <div className="space-y-2">
              {recentPagos.map(p => (
                <div key={p.ID} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm text-gray-900">{p.Concepto}</p>
                    <p className="text-xs text-gray-400">{p.Tipo} · {fmt.date(p.Fecha)}</p>
                  </div>
                  <span className="text-sm font-bold text-amber-600">{fmt.usd(p.Monto)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
