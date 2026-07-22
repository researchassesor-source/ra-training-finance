import { useEffect, useState, useCallback } from 'react'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { fmt } from '../../utils/formatters'
import { exportCertificadosAvalExcel, exportCertificadosAvalPDF } from '../../utils/exporters'
import Modal from '../UI/Modal'
import Spinner from '../UI/Spinner'
import { ShieldCheck, Clock, ExternalLink, Download, FileText } from 'lucide-react'

export default function CertificadosAvalView() {
  const { isAdmin } = useAuth()
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [filtros, setFiltros] = useState({ estadoAval: '', institucionAval: '', servicio: '', desde: '', hasta: '' })
  const [avalTarget, setAvalTarget] = useState(null)
  const [referencia, setReferencia] = useState('')
  const [valorAval, setValorAval]   = useState('')
  const [enlaceExterno, setEnlaceExterno] = useState('')
  const [codigoExterno, setCodigoExterno] = useState('')
  const [saving, setSaving]   = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.getCertificadosAval(filtros.estadoAval ? { estadoAval: filtros.estadoAval } : {})
      .then(r => setData(r.data || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [filtros.estadoAval])

  useEffect(() => { load() }, [load])

  // Servicio + rango de fechas se filtran en el cliente sobre lo ya cargado,
  // igual que en InscripcionesList.
  const filtered = data.filter(i => {
    if (filtros.servicio && i.ServicioNombre !== filtros.servicio) return false
    if (filtros.institucionAval && i.InstitucionAval !== filtros.institucionAval) return false
    if (filtros.desde && i.FechaInicio && i.FechaInicio < filtros.desde) return false
    if (filtros.hasta && i.FechaInicio && i.FechaInicio > filtros.hasta) return false
    return true
  })

  const serviciosUnicos = [...new Set(data.map(i => i.ServicioNombre).filter(Boolean))].sort()
  const institucionesUnicas = [...new Set(data.map(i => i.InstitucionAval).filter(Boolean))].sort()

  function openAval(item) {
    setError('')
    setAvalTarget(item)
    setReferencia(item.AvalReferencia || '')
    setValorAval(item.ValorAval || '')
    setEnlaceExterno(item.AvalEnlaceExterno || '')
    setCodigoExterno(item.AvalCodigoExterno || '')
  }

  async function handleMarcarAval(e) {
    e.preventDefault()
    if (![referencia, enlaceExterno, codigoExterno].some(value => value.trim())) {
      setError('Ingrese al menos una referencia, un código externo o un enlace de validación.')
      return
    }
    setSaving(true)
    try {
      await api.marcarAval(avalTarget.ID, {
        avalReferencia: referencia,
        valorAval,
        avalEnlaceExterno: enlaceExterno,
        avalCodigoExterno: codigoExterno,
      })
      setAvalTarget(null)
      load()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const pendientes   = filtered.filter(i => i.EstadoAval !== 'avalado').length
  const avalados     = filtered.filter(i => i.EstadoAval === 'avalado').length
  const totalAPagar  = filtered.reduce((s, i) => s + (Number(i.ValorAval) || 0), 0)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Certificados con aval institucional</h2>
        <p className="text-sm text-gray-500">
          {isAdmin ? 'Control de certificados que dependen de una institución avaladora.' : 'Solo se muestran los certificados asignados a su institución.'}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <select className="input w-auto text-sm" value={filtros.estadoAval}
            onChange={e => setFiltros(f => ({ ...f, estadoAval: e.target.value }))}>
            <option value="">Todos (aval generado o no)</option>
            <option value="pendiente">Aval no generado</option>
            <option value="avalado">Aval generado</option>
          </select>
          {isAdmin && (
            <select className="input w-auto text-sm" value={filtros.institucionAval}
              onChange={e => setFiltros(f => ({ ...f, institucionAval: e.target.value }))}>
              <option value="">Todas las instituciones</option>
              {institucionesUnicas.map(nombre => <option key={nombre}>{nombre}</option>)}
            </select>
          )}
          <select className="input w-auto text-sm" value={filtros.servicio}
            onChange={e => setFiltros(f => ({ ...f, servicio: e.target.value }))}>
            <option value="">Todos los cursos</option>
            {serviciosUnicos.map(s => <option key={s}>{s}</option>)}
          </select>
          <input className="input w-36 text-sm" type="date" placeholder="Desde" value={filtros.desde}
            onChange={e => setFiltros(f => ({ ...f, desde: e.target.value }))} />
          <input className="input w-36 text-sm" type="date" placeholder="Hasta" value={filtros.hasta}
            onChange={e => setFiltros(f => ({ ...f, hasta: e.target.value }))} />
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportCertificadosAvalExcel(filtered)} className="btn-secondary text-sm" disabled={filtered.length === 0}>
            <Download size={15} /> Excel
          </button>
          <button onClick={() => exportCertificadosAvalPDF(filtered, filtros.estadoAval ? `Filtro: ${filtros.estadoAval}` : '')} className="btn-secondary text-sm" disabled={filtered.length === 0}>
            <FileText size={15} /> PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card py-3 text-center">
          <p className="text-xl font-bold text-gray-900">{filtered.length}</p>
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
                  {['Fecha Curso','Participante','Servicio','Institución','Modalidad','Horas','Estado de Aval','Referencia','Valor Aval',''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-10 text-gray-400">Sin certificados con aval externo</td></tr>
                ) : filtered.map(i => (
                  <tr key={i.ID} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                      {fmt.date(i.FechaInicio)}{i.FechaFin ? ` — ${fmt.date(i.FechaFin)}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{i.ClienteNombre}</p>
                      {i.ClienteID && <p className="text-xs text-gray-400">CI: {i.ClienteID}</p>}
                      {i.ClienteEmail && <p className="text-xs text-gray-400">{i.ClienteEmail}</p>}
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate">{i.ServicioNombre}</td>
                    <td className="px-4 py-3 max-w-[180px] truncate" title={i.InstitucionAval || ''}>{i.InstitucionAval || '—'}</td>
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
                      {i.AvalEnlaceExterno ? (
                        <a href={i.AvalEnlaceExterno} target="_blank" rel="noopener noreferrer"
                            className="text-brand-600 hover:underline flex items-center gap-1">
                            Ver enlace <ExternalLink size={11} />
                        </a>
                      ) : i.AvalReferencia ? <span className="font-mono text-gray-600">{i.AvalReferencia}</span> : '—'}
                      {i.AvalCodigoExterno && <p className="font-mono text-[10px] text-gray-400 mt-1">{i.AvalCodigoExterno}</p>}
                    </td>
                    <td className="px-4 py-3 font-semibold text-brand-700 whitespace-nowrap">
                      {i.EstadoAval === 'avalado' ? fmt.usd(i.ValorAval) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => openAval(i)} className="btn-primary text-xs px-3 py-1.5">
                        {i.EstadoAval === 'avalado' ? 'Editar aval' : 'Marcar avalado'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={!!avalTarget} onClose={() => setAvalTarget(null)} title="Registrar aval institucional" size="sm">
        {avalTarget && (
          <form onSubmit={handleMarcarAval} className="space-y-4">
            <p className="text-sm text-gray-600">
              Confirmando el aval externo para <span className="font-medium">{avalTarget.ClienteNombre}</span> — {avalTarget.ServicioNombre}
            </p>
            <div>
              <label className="label">Referencia del aval</label>
              <input className="input" value={referencia} onChange={e => setReferencia(e.target.value)}
                placeholder="Ej.: AVAL-2026-0031" />
            </div>
            <div>
              <label className="label">Valor del aval (USD)</label>
              <input className="input" type="number" step="0.01" min="0" value={valorAval}
                onChange={e => setValorAval(e.target.value)} placeholder="0.00" />
              <p className="text-xs text-gray-400 mt-1">Costo de este aval, para el pago de la factura correspondiente.</p>
            </div>
            <div>
              <label className="label">Enlace de validación externo</label>
              <input className="input" type="url" value={enlaceExterno} onChange={e => setEnlaceExterno(e.target.value)}
                placeholder="https://institucion.example/verificar/..." />
              <p className="text-xs text-gray-500 mt-1">Se mostrará como direccionamiento externo. No se generará un segundo QR.</p>
            </div>
            <div>
              <label className="label">Código externo / Ministerio</label>
              <input className="input" value={codigoExterno} onChange={e => setCodigoExterno(e.target.value)}
                placeholder="Código emitido por la institución" />
              <p className="text-xs text-gray-500 mt-1">Debe registrar al menos una referencia, código o enlace para confirmar el aval.</p>
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
