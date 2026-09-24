import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import Modal from '../UI/Modal'

const MAX_PNG_BYTES = 1_500_000

function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('No se pudo leer el archivo PNG.'))
    reader.readAsDataURL(file)
  })
}

export default function CertificateSigningSettings({ open, onClose }) {
  const [status, setStatus] = useState(null)
  const [files, setFiles] = useState({ director: null, manager: null })
  const [confirmed, setConfirmed] = useState(false)
  const [approvedDesign, setApprovedDesign] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!open) return
    let current = true
    setError('')
    setMessage('')
    api.getEstadoFirmasCertificado().then(result => {
      if (current) setStatus(result.data)
    }).catch(err => { if (current) setError(err.message) })
    return () => { current = false }
  }, [open])

  async function upload(role) {
    const file = files[role]
    if (!file || !confirmed) return
    if (file.type !== 'image/png' || file.size > MAX_PNG_BYTES) {
      setError('La firma debe ser PNG de hasta 1,5 MB.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const pngBase64 = await readDataUrl(file)
      await api.registrarFirmaOficialCertificado(role, pngBase64, 'CONFIRMO_FIRMA_AUTENTICA_Y_USO_AUTORIZADO')
      setFiles(current => ({ ...current, [role]: null }))
      setStatus((await api.getEstadoFirmasCertificado()).data)
      setMessage(`Firma de ${role === 'director' ? 'Dirección Académica' : 'Gerencia General'} registrada en Drive privado.`)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  async function activate() {
    if (!approvedDesign) return
    setBusy(true)
    setError('')
    try {
      await api.activarPlantillaCertificadoV2('ACTIVAR_CERTIFICADOS_SEGURIDAD_V2')
      setStatus((await api.getEstadoFirmasCertificado()).data)
      setMessage('Plantilla de seguridad activada solo para emisiones futuras. Los PDF históricos no cambian.')
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  return <Modal open={open} onClose={onClose} title="Firmas y plantilla de certificados" size="md">
    <div className="space-y-4 text-sm">
      <p className="rounded-xl bg-blue-50 p-3 text-blue-900">
        Las rúbricas auténticas se guardan en Drive privado. No se incorporan al código ni a los certificados anteriores.
        Una vez registradas, no se reemplazan dentro de esta versión.
      </p>
      {['director', 'manager'].map(role => <div key={role} className="rounded-xl border border-slate-200 p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">{role === 'director' ? 'Dirección Académica' : 'Gerencia General'}</span>
          <span className={status?.[role] ? 'badge-green' : 'badge-gray'}>{status?.[role] ? 'Registrada' : 'Pendiente'}</span>
        </div>
        {!status?.[role] && <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input aria-label={`Firma de ${role}`} type="file" accept="image/png" className="input min-w-0 flex-1"
            onChange={event => setFiles(current => ({ ...current, [role]: event.target.files?.[0] || null }))} />
          <button type="button" className="btn-secondary" disabled={busy || !confirmed || !files[role]}
            onClick={() => upload(role)}>Guardar firma</button>
        </div>}
      </div>)}
      {!status?.plantillaActiva && <label className="flex items-start gap-2 text-slate-700">
        <input type="checkbox" className="mt-1" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
        Confirmo que ambas firmas son rúbricas auténticas y que R.A. Training tiene autorización para utilizarlas en estos certificados.
      </label>}
      <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 space-y-3">
        <p className="font-medium text-orange-950">Activación para emisiones nuevas</p>
        <p className="text-orange-900">Revise primero el PDF visual de prueba. Activar no altera ni regenera certificados históricos.</p>
        {!status?.plantillaActiva && <label className="flex items-center gap-2 text-orange-950">
          <input type="checkbox" checked={approvedDesign} onChange={event => setApprovedDesign(event.target.checked)} />
          Apruebo visualmente el diseño definitivo.
        </label>}
        <button type="button" className="btn-primary" disabled={busy || status?.plantillaActiva || !status?.director || !status?.manager || !approvedDesign}
          onClick={activate}>{status?.plantillaActiva ? 'Plantilla v2 activa' : 'Activar plantilla v2'}</button>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-green-50 p-3 text-green-800">{message}</p>}
    </div>
  </Modal>
}
