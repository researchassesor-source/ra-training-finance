import { useEffect, useMemo, useState } from 'react'
import { api } from '../../services/api'
import {
  exportIngresosPDF, exportEgresosPDF, exportPagosPDF, exportContratosPDF,
  exportResumenPDF, exportResumenWord, exportFlujosTrabajoPDF, exportAsistenciaPDF,
} from '../../utils/exporters'
import { FileText, Download, Loader2, ClipboardList, CalendarCheck } from 'lucide-react'
import { fmt } from '../../utils/formatters'
import { useAuth } from '../../context/AuthContext'

const YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 5 }, (_, i) => YEAR - i)

function ReportCard({ icon: Icon, title, description, onPDF, onWord, loading }) {
  return (
    <div className="card flex items-start gap-4">
      <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center flex-shrink-0">
        <Icon size={20} className="text-brand-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5 mb-3">{description}</p>
        <div className="flex gap-2">
          <button onClick={onPDF} disabled={loading}
            className="btn-secondary text-xs py-1.5 px-3">
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            PDF
          </button>
          {onWord && (
            <button onClick={onWord} disabled={loading}
              className="btn-secondary text-xs py-1.5 px-3">
              {loading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              Word
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ReportesView() {
  const { isAdmin, user } = useAuth()
  const [year, setYear]     = useState(YEAR)
  const [desde, setDesde]   = useState('')
  const [hasta, setHasta]   = useState('')
  const [loading, setLoading] = useState({})
  const [error, setError]   = useState('')
  const [usuarios, setUsuarios] = useState([])
  const [usuarioReporte, setUsuarioReporte] = useState('')

  useEffect(() => {
    if (!isAdmin) return
    api.getUsuarios()
      .then(r => {
        const activos = (r.data || []).filter(u => u.Activo === true || u.Activo === 'TRUE')
        setUsuarios(activos)
      })
      .catch(() => {})
  }, [isAdmin])

  const periodo = useMemo(() => ({
    desde: desde || `${year}-01-01`,
    hasta: hasta || `${year}-12-31`,
  }), [desde, hasta, year])

  const usuariosObjetivo = useMemo(() => {
    if (!isAdmin) return [{ Username: user?.username, Nombre: user?.nombre || user?.username }]
    if (usuarioReporte) return usuarios.filter(u => u.Username === usuarioReporte)
    return usuarios
  }, [isAdmin, user, usuarios, usuarioReporte])

  function setLoad(key, val) { setLoading(l => ({ ...l, [key]: val })) }

  async function genIngresosPDF() {
    setLoad('ing', true)
    try {
      const r = await api.getIngresos({ desde, hasta })
      exportIngresosPDF(r.data || [], { label: desde && hasta ? `${desde} al ${hasta}` : year })
    } catch (e) { setError(e.message) }
    finally { setLoad('ing', false) }
  }

  async function genEgresosPDF() {
    setLoad('egr', true)
    try {
      const r = await api.getEgresos({ desde, hasta })
      exportEgresosPDF(r.data || [], { label: desde && hasta ? `${desde} al ${hasta}` : year })
    } catch (e) { setError(e.message) }
    finally { setLoad('egr', false) }
  }

  async function genPagosPDF() {
    setLoad('pag', true)
    try {
      const r = await api.getPagos({ desde, hasta })
      exportPagosPDF(r.data || [])
    } catch (e) { setError(e.message) }
    finally { setLoad('pag', false) }
  }

  async function genContratosPDF() {
    setLoad('con', true)
    try {
      const r = await api.getContratos()
      exportContratosPDF(r.data || [])
    } catch (e) { setError(e.message) }
    finally { setLoad('con', false) }
  }

  async function genResumen(formato) {
    setLoad('res', true)
    try {
      const [dash, ings, egrs] = await Promise.all([
        api.getDashboard(year),
        api.getIngresos({ desde: `${year}-01-01`, hasta: `${year}-12-31` }),
        api.getEgresos({ desde: `${year}-01-01`, hasta: `${year}-12-31` }),
      ])
      const payload = {
        kpis: dash.data.kpis,
        ingresosXMes: dash.data.ingresosXMes,
        egresosXMes: dash.data.egresosXMes,
        year,
        ingresos: ings.data || [],
        egresos: egrs.data || [],
      }
      if (formato === 'pdf') exportResumenPDF(payload)
      else await exportResumenWord(payload)
    } catch (e) { setError(e.message) }
    finally { setLoad('res', false) }
  }

  function usuarioLabel() {
    if (!isAdmin) return user?.nombre || user?.username || 'Mi usuario'
    if (usuarioReporte) {
      const u = usuarios.find(item => item.Username === usuarioReporte)
      return u ? `${u.Nombre} (@${u.Username})` : usuarioReporte
    }
    return 'Todos los usuarios activos'
  }

  async function genFlujosPDF() {
    setLoad('flu', true)
    setError('')
    try {
      if (isAdmin && usuarios.length === 0) throw new Error('No hay usuarios activos para generar el reporte.')
      const r = await api.getReporteFlujosTrabajo({
        ...(usuarioReporte ? { username: usuarioReporte } : {}),
        desde: periodo.desde,
        hasta: periodo.hasta,
      })
      const flujos = r.data || []
      exportFlujosTrabajoPDF({ usuarioLabel: usuarioLabel(), desde: periodo.desde, hasta: periodo.hasta, flujos })
    } catch (e) { setError(e.message) }
    finally { setLoad('flu', false) }
  }

  async function genAsistenciaPDF() {
    setLoad('asi', true)
    setError('')
    try {
      if (isAdmin && usuarios.length === 0) throw new Error('No hay usuarios activos para generar el reporte.')
      const r = await api.getReporteAsistencia({
        ...(usuarioReporte ? { username: usuarioReporte } : {}),
        desde: periodo.desde,
        hasta: periodo.hasta,
      })
      exportAsistenciaPDF({
        usuarioLabel: usuarioLabel(),
        desde: periodo.desde,
        hasta: periodo.hasta,
        registros: r.data?.registros || [],
        resumenes: r.data?.resumenes || [],
      })
    } catch (e) { setError(e.message) }
    finally { setLoad('asi', false) }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Filters */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">Filtros de Período</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="label">Año fiscal</label>
            <select className="input" value={year} onChange={e => setYear(Number(e.target.value))}>
              {YEARS.map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Desde (opcional)</label>
            <input className="input" type="date" value={desde} onChange={e => setDesde(e.target.value)} />
          </div>
          <div>
            <label className="label">Hasta (opcional)</label>
            <input className="input" type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
          </div>
          <div>
            <label className="label">Usuario interno</label>
            {isAdmin ? (
              <select className="input" value={usuarioReporte} onChange={e => setUsuarioReporte(e.target.value)}>
                <option value="">Todos los usuarios</option>
                {usuarios.map(u => <option key={u.ID} value={u.Username}>{u.Nombre}</option>)}
              </select>
            ) : (
              <input className="input" disabled value={user?.nombre || user?.username || 'Mi usuario'} />
            )}
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          El informe ejecutivo usa el año fiscal completo. Los demás reportes usan el rango de fechas si se especifica.
        </p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      {/* Report cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ReportCard
          icon={FileText}
          title="Informe Ejecutivo Anual"
          description={`Resumen completo con KPIs, tablas mensuales y detalle de ingresos/egresos para el año ${year}.`}
          onPDF={() => genResumen('pdf')}
          onWord={() => genResumen('word')}
          loading={loading.res}
        />
        <ReportCard
          icon={FileText}
          title="Reporte de Ingresos"
          description="Listado detallado de todos los ingresos en el período seleccionado."
          onPDF={genIngresosPDF}
          loading={loading.ing}
        />
        <ReportCard
          icon={FileText}
          title="Reporte de Egresos"
          description="Listado de gastos por categoría con estado de aprobación."
          onPDF={genEgresosPDF}
          loading={loading.egr}
        />
        <ReportCard
          icon={FileText}
          title="Reporte de Pagos"
          description="Historial de pagos a proveedores, facturas y transferencias."
          onPDF={genPagosPDF}
          loading={loading.pag}
        />
        <ReportCard
          icon={FileText}
          title="Reporte de Contratos"
          description="Estado actual de todos los contratos con clientes y proveedores."
          onPDF={genContratosPDF}
          loading={loading.con}
        />
        <ReportCard
          icon={ClipboardList}
          title="Reporte de Flujo de Trabajo"
          description="Actividades planificadas, estados, evidencias y horas reales por usuario y período."
          onPDF={genFlujosPDF}
          loading={loading.flu}
        />
        <ReportCard
          icon={CalendarCheck}
          title="Reporte de Asistencia"
          description="Timbradas de entrada/salida y horas contabilizadas por usuario, semana o rango de fechas."
          onPDF={genAsistenciaPDF}
          loading={loading.asi}
        />
      </div>
    </div>
  )
}
