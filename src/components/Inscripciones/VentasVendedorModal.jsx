import { useEffect, useMemo, useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { api } from '../../services/api'
import { fmt } from '../../utils/formatters'
import { exportVentasVendedorCSV, exportVentasVendedorPDF } from '../../utils/exporters'
import Spinner from '../UI/Spinner'

export default function VentasVendedorModal({ vendedores }) {
  const [vendedor, setVendedor] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!vendedor && vendedores.length) setVendedor(vendedores[0].username)
  }, [vendedor, vendedores])

  useEffect(() => {
    if (!vendedor) return
    setLoading(true)
    setError('')
    api.getInscripciones({ vendedor, desde, hasta })
      .then(result => setData(result.data || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [vendedor, desde, hasta])

  const selected = vendedores.find(item => item.username === vendedor)
  const summary = useMemo(() => ({
    count: data.length,
    sold: data.reduce((sum, item) => sum + (Number(item.Monto) || 0), 0),
    collected: data.filter(item => item.EstadoPago === 'verificado').reduce((sum, item) => sum + (Number(item.Monto) || 0), 0),
    pending: data.filter(item => item.EstadoPago !== 'verificado' && item.EstadoPago !== 'cancelado').reduce((sum, item) => sum + (Number(item.Monto) || 0), 0),
    issued: data.filter(item => item.EstadoCertificado === 'emitido').length,
    avalPending: data.filter(item => (item.RequiereAvalExterno === true || item.RequiereAvalExterno === 'TRUE') && item.EstadoAval !== 'avalado').length,
  }), [data])

  const report = { vendedor: selected, desde, hasta, data, summary }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="label">Vendedor</label>
          <select className="input" value={vendedor} onChange={e => setVendedor(e.target.value)}>
            {vendedores.map(item => <option key={item.username} value={item.username}>{item.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Fecha desde</label>
          <input className="input" type="date" value={desde} onChange={e => setDesde(e.target.value)} />
        </div>
        <div>
          <label className="label">Fecha hasta</label>
          <input className="input" type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">
          <span className="font-semibold">{selected?.nombre || 'Sin vendedor'}</span>
          {selected?.username && <span className="text-gray-400"> · @{selected.username}</span>}
        </p>
        <div className="flex gap-2">
          <button className="btn-secondary text-sm" disabled={!data.length} onClick={() => exportVentasVendedorCSV(report)}>
            <Download size={15} /> CSV
          </button>
          <button className="btn-secondary text-sm" disabled={!data.length} onClick={() => exportVentasVendedorPDF(report)}>
            <FileText size={15} /> PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
        <Stat label="Inscripciones" value={summary.count} />
        <Stat label="Vendido" value={fmt.usd(summary.sold)} />
        <Stat label="Recaudado" value={fmt.usd(summary.collected)} />
        <Stat label="Pendiente" value={fmt.usd(summary.pending)} />
        <Stat label="Cert. emitidos" value={summary.issued} />
        <Stat label="Aval pendiente" value={summary.avalPending} />
      </div>

      {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</p>}
      {loading ? <Spinner text="Preparando reporte..." /> : (
        <div className="overflow-x-auto border border-gray-100 rounded-lg max-h-80">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                {['Fecha','Participante','Curso','Comprobante','Fecha pago','Pago','Certificado','Aval','Valor'].map(label => (
                  <th key={label} className="text-left px-3 py-2 whitespace-nowrap text-gray-500 uppercase">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!data.length ? <tr><td colSpan={9} className="text-center py-8 text-gray-400">Sin ventas para este período</td></tr> : data.map(item => (
                <tr key={item.ID} className="border-t border-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap">{fmt.date(item.FechaCreacion)}</td>
                  <td className="px-3 py-2">{item.ClienteNombre}</td>
                  <td className="px-3 py-2 max-w-[180px] truncate">{item.ServicioNombre}</td>
                  <td className="px-3 py-2 font-mono">{item.NumeroComprobante || item.Notas || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmt.date(item.FechaPago)}</td>
                  <td className="px-3 py-2">{item.EstadoPago}</td>
                  <td className="px-3 py-2">{item.EstadoCertificado}</td>
                  <td className="px-3 py-2">{item.RequiereAvalExterno === true || item.RequiereAvalExterno === 'TRUE' ? (item.EstadoAval || 'pendiente') : 'Sin aval'}</td>
                  <td className="px-3 py-2 font-semibold">{fmt.usd(item.Monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3 text-center">
      <p className="text-sm font-bold text-brand-700">{value}</p>
      <p className="text-[11px] text-gray-500">{label}</p>
    </div>
  )
}
