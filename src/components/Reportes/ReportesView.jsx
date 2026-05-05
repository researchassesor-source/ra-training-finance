import { useState } from 'react'
import { api } from '../../services/api'
import { exportIngresosPDF, exportEgresosPDF, exportPagosPDF, exportContratosPDF, exportResumenPDF, exportResumenWord } from '../../utils/exporters'
import { FileText, Download, Loader2 } from 'lucide-react'
import { fmt } from '../../utils/formatters'

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
  const [year, setYear]     = useState(YEAR)
  const [desde, setDesde]   = useState('')
  const [hasta, setHasta]   = useState('')
  const [loading, setLoading] = useState({})
  const [error, setError]   = useState('')

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

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Filters */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">Filtros de Período</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
        </div>
        <p className="text-xs text-gray-400 mt-2">
          El informe ejecutivo siempre usa el año fiscal completo. Los demás reportes usan el rango de fechas si se especifica.
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
      </div>
    </div>
  )
}
