import { useMemo, useState } from 'react'
import { CheckCircle2, Mail, XCircle } from 'lucide-react'
import { api } from '../../services/api'
import { blobToBase64 } from '../../utils/blob'
import { certificatePdfRepository } from '../../services/certificatePdfRepository'
import { CERTIFICATE_PERMISSION_MESSAGE } from '../../utils/certificatePermissions'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function EnvioMasivoCertificadosModal({ inscripciones, isAdmin, onClose, onUpdated }) {
  const elegibles = useMemo(() => inscripciones.filter(item => (
    item.EstadoCertificado === 'emitido' && EMAIL_RE.test(String(item.ClienteEmail || '').trim())
  )), [inscripciones])
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState([])

  async function sendAll() {
    setSending(true)
    setProgress(0)
    setResults([])
    const nextResults = []

    for (let index = 0; index < elegibles.length; index += 1) {
      const item = elegibles[index]
      try {
        const issued = await api.getCertificadoParaDescarga(item.ID)
        const certificate = await certificatePdfRepository.prepare(issued.data, { allowHistoricalRecovery: true })
        await api.registrarArtefactoCertificado(item.ID, {
          pdfHash: certificate.hash,
          pdfStorageReference: certificate.reference,
          templateVersion: certificate.templateVersion,
          certificateVersion: certificate.certificateVersion,
          historicalRecovery: certificate.historicalRecovered,
          auditAction: certificate.auditAction,
        })
        await api.registrarGeneracionCertificado(item.ID)
        if (certificate.blob.size > 3 * 1024 * 1024) {
          throw new Error('El PDF supera el límite de 3 MB.')
        }
        await api.enviarCertificadoEmail(item.ID, {
          pdfBase64: await blobToBase64(certificate.blob),
          mimeType: 'application/pdf',
          filename: certificate.filename,
          email: item.ClienteEmail,
        })
        nextResults.push({ id: item.ID, name: item.ClienteNombre, ok: true })
      } catch (error) {
        nextResults.push({ id: item.ID, name: item.ClienteNombre, ok: false, error: error.message })
      }
      setResults([...nextResults])
      setProgress(index + 1)
    }

    setSending(false)
    onUpdated?.()
  }

  const sent = results.filter(item => item.ok).length
  const failed = results.filter(item => !item.ok).length
  const finished = !sending && results.length > 0

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{CERTIFICATE_PERMISSION_MESSAGE}</p>
        <div className="flex justify-end"><button type="button" onClick={onClose} className="btn-secondary">Cerrar</button></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <p className="font-semibold">Envío individual automatizado</p>
        <p className="mt-1 text-blue-800">
          Se generará el PDF personalizado de cada participante y se enviará a su correo registrado.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <Metric label="Seleccionados" value={inscripciones.length} />
        <Metric label="Listos para enviar" value={elegibles.length} color="text-emerald-700" />
        <Metric label="Sin correo válido" value={inscripciones.length - elegibles.length} color="text-amber-700" />
      </div>

      {elegibles.length > 0 && (
        <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
          {elegibles.map(item => {
            const result = results.find(current => current.id === item.ID)
            return (
              <div key={item.ID} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{item.ClienteNombre}</p>
                  <p className="text-xs text-gray-500 truncate">{item.ClienteEmail}</p>
                </div>
                {result?.ok && <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0" />}
                {result && !result.ok && <XCircle size={18} className="text-red-500 flex-shrink-0" title={result.error} />}
              </div>
            )
          })}
        </div>
      )}

      {(sending || finished) && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-gray-600">
            <span>{sending ? 'Enviando certificados…' : 'Proceso finalizado'}</span>
            <span>{progress}/{elegibles.length}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full bg-brand-600 transition-all" style={{ width: `${elegibles.length ? (progress / elegibles.length) * 100 : 0}%` }} />
          </div>
          {finished && (
            <p className={`rounded-lg p-3 text-sm ${failed ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
              {sent} enviado{sent === 1 ? '' : 's'} correctamente{failed ? `; ${failed} no se pudieron enviar.` : '.'}
            </p>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onClose} disabled={sending} className="btn-secondary flex-1">Cerrar</button>
        {!finished && (
          <button type="button" onClick={sendAll} disabled={sending || elegibles.length === 0} className="btn-primary flex-1 justify-center">
            <Mail size={16} /> {sending ? `Enviando ${progress + 1} de ${elegibles.length}` : `Enviar ${elegibles.length} certificado${elegibles.length === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value, color = 'text-gray-900' }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-[11px] text-gray-500">{label}</p>
    </div>
  )
}
