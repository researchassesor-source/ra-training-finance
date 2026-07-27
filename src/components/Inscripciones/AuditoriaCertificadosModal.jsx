import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { fmt } from '../../utils/formatters'
import { certificateAuditActionForDisplay } from '../../utils/certificateAudit'
import Spinner from '../UI/Spinner'

export default function AuditoriaCertificadosModal({ onClose }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getAuditoriaCertificados({ limit: 100 })
      .then(result => setEvents(result.data || []))
      .catch(err => setError(err.message || 'No se pudo cargar la auditoría.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner text="Cargando auditoría de certificados..." />

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-brand-100 bg-brand-50 p-3 text-sm text-brand-900">
        Registro de solo lectura. Muestra acciones administrativas e intentos rechazados sin contraseñas, tokens ni archivos.
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!error && (
        <div className="max-h-[55vh] overflow-auto rounded-lg border border-gray-200">
          <table className="min-w-[900px] w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Acción</th>
                <th className="px-3 py-2">Usuario / rol</th>
                <th className="px-3 py-2">Inscripción</th>
                <th className="px-3 py-2">Cambio</th>
                <th className="px-3 py-2">Resultado</th>
                <th className="px-3 py-2">Canal</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr><td colSpan="7" className="px-3 py-8 text-center text-gray-400">Sin eventos registrados</td></tr>
              ) : events.map(event => (
                <tr key={event.ID} className="border-t border-gray-100 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-gray-500">{fmt.date(event.FechaHora)}<span className="block">{fmt.time(event.FechaHora)}</span></td>
                  <td className="px-3 py-2 font-medium text-gray-900">{certificateAuditActionForDisplay(event)}</td>
                  <td className="px-3 py-2">{event.Usuario || '—'}<span className="block text-gray-400">{event.Rol || '—'}</span></td>
                  <td className="px-3 py-2 font-mono text-[10px]">{event.InscripcionID || '—'}</td>
                  <td className="px-3 py-2">{event.EstadoAnterior || '—'} → {event.EstadoNuevo || '—'}</td>
                  <td className="px-3 py-2"><span className={event.Resultado === 'rechazado' || event.Resultado === 'error' ? 'badge-red' : 'badge-green'}>{event.Resultado || 'ok'}</span>{event.Motivo && <span className="mt-1 block max-w-xs text-gray-500">{event.Motivo}</span>}</td>
                  <td className="px-3 py-2">{event.Canal || 'sistema'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-end"><button type="button" onClick={onClose} className="btn-secondary">Cerrar</button></div>
    </div>
  )
}
