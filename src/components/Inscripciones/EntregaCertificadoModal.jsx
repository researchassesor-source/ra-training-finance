import { useState } from 'react'
import { saveAs } from 'file-saver'
import { Download, Mail, MessageCircle, Share2 } from 'lucide-react'
import { api } from '../../services/api'
import { buildCertificatePdf } from '../../utils/certificateGenerator'
import { blobToBase64 } from '../../utils/blob'
import { CERTIFICATE_PERMISSION_MESSAGE } from '../../utils/certificatePermissions'

export default function EntregaCertificadoModal({ inscripcion, isAdmin, onClose, onUpdated }) {
  const [email, setEmail] = useState(inscripcion.ClienteEmail || '')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  function whatsappUrl(result) {
    const text = `Estimado/a ${inscripcion.ClienteNombre}, R.A. Training ha emitido su certificado del curso ${inscripcion.ServicioNombre}. Código: ${result.certificateCode}. Puede verificar su autenticidad en: ${result.verificationUrl}`
    const phone = String(inscripcion.ClienteTelefono || '').replace(/\D/g, '')
    return phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`
  }

  async function prepare() {
    return buildCertificatePdf(inscripcion)
  }

  async function track(state) {
    await api.actualizarEntregaCertificado(inscripcion.ID, state)
    onUpdated?.()
  }

  async function download() {
    setBusy('download')
    setError('')
    setMessage('')
    try {
      const result = await prepare()
      saveAs(result.blob, result.filename)
      await track('descargado')
      setMessage('El PDF se descargó correctamente.')
    } catch (err) { setError(err.message) }
    finally { setBusy('') }
  }

  async function share() {
    setBusy('share')
    setError('')
    setMessage('')
    try {
      const result = await prepare()
      const file = new File([result.blob], result.filename, { type: 'application/pdf' })
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: 'Certificado académico R.A. Training',
          text: `Certificado de ${inscripcion.ClienteNombre}`,
          files: [file],
        })
        await track('compartido')
        setMessage('El certificado se compartió mediante el dispositivo.')
      } else {
        saveAs(result.blob, result.filename)
        window.open(whatsappUrl(result), '_blank', 'noopener,noreferrer')
        await track('descargado')
        setMessage('Este navegador no permite compartir archivos: se descargó el PDF y se abrió WhatsApp con el enlace de verificación. Debe adjuntar el PDF manualmente.')
      }
    } catch (err) {
      if (err?.name !== 'AbortError') setError(err.message)
    } finally { setBusy('') }
  }

  async function openWhatsapp() {
    setBusy('whatsapp')
    setError('')
    setMessage('')
    try {
      const result = await prepare()
      window.open(whatsappUrl(result), '_blank', 'noopener,noreferrer')
      setMessage('Se abrió WhatsApp con el mensaje y el enlace. El PDF no se adjunta automáticamente.')
    } catch (err) { setError(err.message) }
    finally { setBusy('') }
  }

  async function sendEmail() {
    setBusy('email')
    setError('')
    setMessage('')
    try {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Ingrese un correo electrónico válido.')
      const result = await prepare()
      if (result.blob.size > 3 * 1024 * 1024) throw new Error('El PDF supera el límite permitido de 3 MB.')
      const pdfBase64 = await blobToBase64(result.blob)
      await api.enviarCertificadoEmail(inscripcion.ID, {
        pdfBase64,
        mimeType: 'application/pdf',
        filename: result.filename,
        email,
      })
      onUpdated?.()
      setMessage('El certificado fue enviado por correo.')
    } catch (err) { setError(err.message) }
    finally { setBusy('') }
  }

  const disabled = Boolean(busy)

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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm bg-gray-50 rounded-lg p-4">
        <Info label="Participante" value={inscripcion.ClienteNombre} />
        <Info label="Curso" value={inscripcion.ServicioNombre} />
        <Info label="Email" value={inscripcion.ClienteEmail || 'No registrado'} />
        <Info label="Teléfono" value={inscripcion.ClienteTelefono || 'No registrado'} />
        <Info label="Código" value={inscripcion.CodigoCertificado} mono />
        <Info label="Estado de entrega" value={inscripcion.EstadoEntrega || 'pendiente'} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button type="button" onClick={download} disabled={disabled} className="btn-secondary justify-center">
          <Download size={16} /> {busy === 'download' ? 'Preparando...' : 'Descargar PDF'}
        </button>
        <button type="button" onClick={share} disabled={disabled} className="btn-secondary justify-center">
          <Share2 size={16} /> {busy === 'share' ? 'Compartiendo...' : 'Compartir'}
        </button>
        <button type="button" onClick={openWhatsapp} disabled={disabled} className="btn-secondary justify-center">
          <MessageCircle size={16} /> {busy === 'whatsapp' ? 'Abriendo...' : 'Abrir WhatsApp'}
        </button>
      </div>

      <div className="border-t border-gray-100 pt-4 space-y-2">
        <label className="label">Enviar PDF por correo</label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="participante@example.com" />
          <button type="button" onClick={sendEmail} disabled={disabled} className="btn-primary whitespace-nowrap justify-center">
            <Mail size={16} /> {busy === 'email' ? 'Enviando...' : 'Enviar correo'}
          </button>
        </div>
      </div>

      {message && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg p-3">{message}</p>}
      {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</p>}
      <div className="flex justify-end">
        <button type="button" onClick={onClose} disabled={disabled} className="btn-secondary">Cerrar</button>
      </div>
    </div>
  )
}

function Info({ label, value, mono = false }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`font-medium text-gray-800 ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
    </div>
  )
}
