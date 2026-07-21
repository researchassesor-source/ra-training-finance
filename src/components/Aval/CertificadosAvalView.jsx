import { useEffect, useState, useCallback } from 'react'
import { api } from '../../services/api'
import { fmt } from '../../utils/formatters'
import { exportCertificadosAvalExcel, exportCertificadosAvalPDF } from '../../utils/exporters'
import Modal from '../UI/Modal'
import Spinner from '../UI/Spinner'
import { ShieldCheck, Clock, ExternalLink, Download, FileText } from 'lucide-react'

export default function CertificadosAvalView() {
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [filtro, setFiltro]   = useState('')
  const [avalTarget, setAvalTarget] = useState(null)
  const [referencia, setReferencia] = useState('')
  const [valorAval, setValorAval]   = useState('')
  const [saving, setSaving]   = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.getCertificadosAval(filtro ? { estadoAval: filtro } : {})
      .then(r => setData(r.data || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [filtro])

  useEffect(() => { load() }, [load])

  function openAval(item) {
    setAvalTarget(item)
    setReferencia('')
    setValorAval('')
  }

  async function handleMarcarAval(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.marcarAval(avalTarget.ID, referencia, valorAval)
      setAvalTarget(null)
      load()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const isUrl = (s) => s && (s.startsWith('http://') || s.startsWith('https://'))
  const pendientes   = data.filter(i => i.EstadoAval !== 'avalado').length
  const avalados     = data.filter(i => i.EstadoAval === 'avalado').length
  const totalAPagar  = data.reduce((s, i) => s + (Number(i.ValorAval) || 0), 0)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Certificados con Aval Externo</h2>
        <p className="text-sm text-gray-500">Listado de participantes cuyo certificado requiere aval externo</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <select className="input w-auto text-sm" value={filtro} onChange={e => setFiltro(e.target.value)}>
          <option value="">Todos</option>
          <option value="pendiente">Pendientes</option>
          <option value="avalado">Avalados</option>
        </select>
        <div className="flex gap-2">
          <button onClick={() => exportCertificadosAvalExcel(data)} className="btn-secondary text-sm" disabled={data.length === 0}>
            <Download size={15} /> Excel
          </button>
          <button onClick={() => exportCertificadosAvalPDF(data, filtro ? `Filtro: ${filtro}` : '')} className="btn-secondary text-sm" disabled={data.length === 0}>
            <FileText size={15} /> PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card py-3 text-center">
          <p className="text-xl font-bold text-gray-900">{data.length}</p>
          <p className="text-xs text-gray-500">Total</p>
        </div>
        <div className="card py-3 text-center">
          <p className="text-xl font-bold text-amber-600">{pendientes}</p>
          <p className="text-xs text-gray-500">Pendientes</p>
        </div>
        <div className="card py-3 text-center">
          <p className="text-xl font-bold text-emerald-600">{avalados}</p>
          <p className="text-xs text-gray-500">Avalados</p>
        </div>
        <div className="card py-3 text-center">
          <p className="text-xl font-bold text-brand-700">{fmt.usd(totalAPagar)}</p>
          <p className="text-xs text-gray-500">Total a pagar (aval)</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

      {loading ? <Spinner text="Cargando certificados..." /> : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Fecha','Participante','Servicio','Modalidad','Horas','Estado de Aval','Referencia','Valor Aval',''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-10 text-gray-400">Sin certificados con aval externo</td></tr>
                ) : data.map(i => (
                  <tr key={i.ID} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">{fmt.date(i.FechaInicio)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{i.ClienteNombre}</td>
                    <td className="px-4 py-3 max-w-xs truncate">{i.ServicioNombre}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{i.Modalidad}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">{i.Duracion || '—'}</td>
                    <td className="px-4 py-3">
                      {i.EstadoAval === 'avalado' ? (
                        <span className="badge-green inline-flex items-center gap-1"><ShieldCheck size={12} /> Avalado</span>
                      ) : (
                        <span className="badge-yellow inline-flex items-center gap-1"><Clock size={12} /> Pendiente</span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[200px] truncate text-xs">
                      {i.AvalReferencia ? (
                        isUrl(i.AvalReferencia) ? (
                          <a href={i.AvalReferencia} target="_blank" rel="noopener noreferrer"
                            className="text-brand-600 hover:underline flex items-center gap-1">
                            Ver enlace <ExternalLink size={11} />
                          </a>
                        ) : (
                          <span className="font-mono text-gray-600">{i.AvalReferencia}</span>
                        )
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 font-semibold text-brand-700 whitespace-nowrap">
                      {i.EstadoAval === 'avalado' ? fmt.usd(i.ValorAval) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {i.EstadoAval !== 'avalado' && (
                        <button onClick={() => openAval(i)} className="btn-primary text-xs px-3 py-1.5">
                          Marcar Avalado
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={!!avalTarget} onClose={() => setAvalTarget(null)} title="Marcar Certificado como Avalado" size="sm">
        {avalTarget && (
          <form onSubmit={handleMarcarAval} className="space-y-4">
            <p className="text-sm text-gray-600">
              Confirmando el aval externo para <span className="font-medium">{avalTarget.ClienteNombre}</span> — {avalTarget.ServicioNombre}
            </p>
            <div>
              <label className="label">Código de aval o enlace</label>
              <input className="input" value={referencia} onChange={e => setReferencia(e.target.value)}
                placeholder="Ej: AVAL-2026-0031 o https://..." />
            </div>
            <div>
              <label className="label">Valor del aval (USD)</label>
              <input className="input" type="number" step="0.01" min="0" value={valorAval}
                onChange={e => setValorAval(e.target.value)} placeholder="0.00" />
              <p className="text-xs text-gray-400 mt-1">Costo de este aval, para el pago de la factura correspondiente.</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setAvalTarget(null)} className="btn-secondary flex-1">Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">
                {saving ? 'Guardando...' : 'Confirmar Aval'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
