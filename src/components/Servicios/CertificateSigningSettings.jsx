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
  const [confirmedV3, setConfirmedV3] = useState(false)
  const [approvedDesign, setApprovedDesign] = useState(false)
  const [approvedDesignV3, setApprovedDesignV3] = useState(false)
  const [managerName, setManagerName] = useState('')
  const [managerTitle, setManagerTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!open) return
    let current = true
    setError('')
    setMessage('')
    api.getEstadoFirmasCertificado().then(result => {
      if (current) {
        setStatus(result.data)
        setManagerName(result.data?.managerSigner?.name || '')
        setManagerTitle(result.data?.managerSigner?.title || '')
      }
    }).catch(err => { if (current) setError(err.message) })
    return () => { current = false }
  }, [open])

  async function upload(role, version = 'v2') {
    const fileKey = version === 'v3' ? `${role}V3` : role
    const file = files[fileKey]
    if (!file || !(version === 'v3' ? confirmedV3 : confirmed)) return
    if (file.type !== 'image/png' || file.size > MAX_PNG_BYTES) {
      setError('La firma debe ser PNG de hasta 1,5 MB.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const pngBase64 = await readDataUrl(file)
      await api.registrarFirmaOficialCertificado(role, pngBase64, 'CONFIRMO_FIRMA_AUTENTICA_Y_USO_AUTORIZADO', version)
      setFiles(current => ({ ...current, [fileKey]: null }))
      setStatus((await api.getEstadoFirmasCertificado()).data)
      setMessage(`Firma de ${role === 'director' ? 'Dirección Académica' : 'Gerencia General'} registrada para ${version} en Drive privado.`)
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

  async function activateV3() {
    if (!approvedDesignV3) return
    setBusy(true)
    setError('')
    try {
      await api.activarPlantillaCertificadoV3('ACTIVAR_CERTIFICADOS_SEGURIDAD_V3')
      setStatus((await api.getEstadoFirmasCertificado()).data)
      setMessage('Firmas v3 activadas para certificados nuevos. Las versiones anteriores conservan sus rúbricas y PDF archivados.')
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  async function saveManagerSigner() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await api.guardarDatosFirmanteCertificado(managerName, managerTitle)
      setStatus((await api.getEstadoFirmasCertificado()).data)
      setMessage('Nombre y cargo oficiales del gerente guardados. Se usarán en las nuevas emisiones avaladas.')
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
      <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div>
          <h3 className="font-medium text-slate-900">Datos del gerente que firma</h3>
          <p className="mt-1 text-xs text-slate-600">Se imprimen junto a la rúbrica de Gerencia General en los certificados avalados. No se usan datos de ejemplo.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="certificate-manager-name">Nombre oficial *</label><input id="certificate-manager-name" className="input" maxLength={160} value={managerName} onChange={event => setManagerName(event.target.value)} /></div>
          <div><label className="label" htmlFor="certificate-manager-title">Cargo oficial *</label><input id="certificate-manager-title" className="input" maxLength={100} value={managerTitle} onChange={event => setManagerTitle(event.target.value)} /></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={status?.managerSignerConfigured ? 'badge-green' : 'badge-yellow'}>{status?.managerSignerConfigured ? 'Datos guardados' : 'Falta configurar'}</span>
          <button type="button" className="btn-secondary" disabled={busy || managerName.trim().length < 3 || managerTitle.trim().length < 3}
            onClick={saveManagerSigner}>Guardar nombre y cargo</button>
        </div>
      </section>
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
      {status?.plantillaActiva && <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
        <div>
          <h3 className="font-semibold text-blue-950">Nueva edición de firmas · v3</h3>
          <p className="mt-1 text-xs text-blue-900">Cargue las dos firmas auténticas en PNG transparente y con el mismo tono. Se guardan como una versión nueva; los originales v2 y certificados anteriores permanecen intactos.</p>
        </div>
        {['director', 'manager'].map(role => {
          const key = `${role}V3`
          return <div key={key} className="rounded-lg border border-blue-200 bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{role === 'director' ? 'Dirección Académica' : 'Gerencia General'}</span>
              <span className={status?.[key] ? 'badge-green' : 'badge-gray'}>{status?.[key] ? 'Registrada en v3' : 'Pendiente'}</span>
            </div>
            {!status?.[key] && <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input aria-label={`Firma v3 de ${role}`} type="file" accept="image/png" className="input min-w-0 flex-1"
                onChange={event => setFiles(current => ({ ...current, [key]: event.target.files?.[0] || null }))} />
              <button type="button" className="btn-secondary" disabled={busy || !confirmedV3 || !files[key]}
                onClick={() => upload(role, 'v3')}>Guardar firma v3</button>
            </div>}
          </div>
        })}
        {status?.versionActiva !== 'ra-security-2026-v3' && <label className="flex items-start gap-2 text-blue-950">
          <input type="checkbox" className="mt-1" checked={confirmedV3} onChange={event => setConfirmedV3(event.target.checked)} />
          Confirmo la autenticidad y autorización de ambas rúbricas nuevas.
        </label>}
        {status?.versionActiva !== 'ra-security-2026-v3' && <label className="flex items-start gap-2 text-blue-950">
          <input type="checkbox" className="mt-1" checked={approvedDesignV3} onChange={event => setApprovedDesignV3(event.target.checked)} />
          Revisé visualmente un PDF de prueba con estas firmas y apruebo su uso en emisiones nuevas.
        </label>}
        <button type="button" className="btn-primary"
          disabled={busy || status?.versionActiva === 'ra-security-2026-v3' || !status?.directorV3 || !status?.managerV3 || !approvedDesignV3}
          onClick={activateV3}>{status?.versionActiva === 'ra-security-2026-v3' ? 'Edición v3 activa' : 'Activar edición v3'}</button>
      </section>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-green-50 p-3 text-green-800">{message}</p>}
    </div>
  </Modal>
}
