import { useEffect, useState, useCallback } from 'react'
import { api } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { fmt } from '../../utils/formatters'
import { exportCertificadosAvalExcel, exportCertificadosAvalPDF } from '../../utils/exporters'
import { sha256Hex } from '../../services/certificateArtifactStore'
import { certificatePdfRepository } from '../../services/certificatePdfRepository'
import { downloadCertificateWithAudit, openCertificatePreviewWindow } from '../../services/certificateDownloadFlow'
import { blobToBase64 } from '../../utils/blob'
import { saveAs } from 'file-saver'
import Modal from '../UI/Modal'
import Spinner from '../UI/Spinner'
import { ShieldCheck, Clock, ExternalLink, Download, FileText, History, Pencil } from 'lucide-react'

const AVAL_TEMPLATE_VERSION = 'ra-institutional-aval-2026'
const LEGACY_AVAL_TEMPLATE_VERSION = 'ra-itsal-security-2026-v1'

export default function CertificadosAvalView() {
  const { isAdmin } = useAuth()
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [filtros, setFiltros] = useState({ estadoAval: '', institucionAval: '', servicio: '', desde: '', hasta: '' })
  const [avalTarget, setAvalTarget] = useState(null)
  const [referencia, setReferencia] = useState('')
  const [enlaceExterno, setEnlaceExterno] = useState('')
  const [codigoExterno, setCodigoExterno] = useState('')
  const [correctionTarget, setCorrectionTarget] = useState(null)
  const [correctionReason, setCorrectionReason] = useState('')
  const [correctionConfirmed, setCorrectionConfirmed] = useState(false)
  const [identityTarget, setIdentityTarget] = useState(null)
  const [identityValue, setIdentityValue] = useState('')
  const [identityType, setIdentityType] = useState('CEDULA_EC')
  const [identityReason, setIdentityReason] = useState('')
  const [identityConfirmed, setIdentityConfirmed] = useState(false)
  const [identityError, setIdentityError] = useState('')
  const [saving, setSaving]   = useState(false)
  const [busyId, setBusyId] = useState('')
  const [notice, setNotice] = useState('')
  const [deliveryTarget, setDeliveryTarget] = useState(null)
  const [deliveryEmail, setDeliveryEmail] = useState('')
  const [lifecycleTarget, setLifecycleTarget] = useState(null)
  const [lifecycleReason, setLifecycleReason] = useState('')
  const [lifecycleConfirmed, setLifecycleConfirmed] = useState(false)
  const [historyTarget, setHistoryTarget] = useState(null)
  const [reconcileTarget, setReconcileTarget] = useState(null)
  const [reconcileResult, setReconcileResult] = useState('')
  const [reconcileReason, setReconcileReason] = useState('')
  const [configurationTarget, setConfigurationTarget] = useState(null)
  const [institutionOptions, setInstitutionOptions] = useState([])
  const [agreementOptions, setAgreementOptions] = useState([])
  const [selectedInstitutionId, setSelectedInstitutionId] = useState('')
  const [selectedAgreementId, setSelectedAgreementId] = useState('')
  const [configurationLoading, setConfigurationLoading] = useState(false)
  const [configurationConfirmed, setConfigurationConfirmed] = useState(false)
  const [normalHistoryTarget, setNormalHistoryTarget] = useState(null)
  const [normalHistory, setNormalHistory] = useState([])
  const [normalHistoryLoading, setNormalHistoryLoading] = useState(false)

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
    if (item.EstadoAval === 'avalado') return
    setError('')
    setAvalTarget(item)
    setReferencia(item.AvalReferencia || '')
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
      const result = await api.marcarAval(avalTarget.ID, {
        avalReferencia: referencia,
        avalEnlaceExterno: enlaceExterno,
        avalCodigoExterno: codigoExterno,
      })
      const message = result.alreadyConfirmed
        ? result.legacy
          ? `El aval ya estaba confirmado. Se conservó el monto histórico de ${fmt.usd(result.data?.valorAval)}; no se recalculó.`
          : `El aval ya estaba confirmado por ${fmt.usd(result.data?.valorAval)}. No se recalculó ni duplicó.`
        : `Aval confirmado y cálculo congelado: ${fmt.usd(result.data?.valorAval)}.`
      setNotice(result.warning || message)
      setAvalTarget(null)
      load()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  async function handleCorrectConfirmedAval(e) {
    e.preventDefault()
    if (!correctionTarget || !correctionConfirmed || correctionReason.trim().length < 10) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await api.corregirAvalConfirmado(correctionTarget.ID, {
        avalReferencia: correctionTarget.AvalReferencia || '',
        avalEnlaceExterno: correctionTarget.AvalEnlaceExterno || '',
        avalCodigoExterno: correctionTarget.AvalCodigoExterno || '',
        motivo: correctionReason.trim(),
      })
      setCorrectionTarget(null)
      setNotice('Corrección registrada con trazabilidad administrativa. El cálculo económico del aval no cambió.')
      load()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  async function handleCorrectIdentity(e) {
    e.preventDefault()
    if (!identityTarget || !identityConfirmed || identityReason.trim().length < 10) return
    setSaving(true)
    setError('')
    setIdentityError('')
    setNotice('')
    try {
      await api.corregirIdentificacionAvalConfirmado(identityTarget.ID, {
        identificacionAnterior: String(identityTarget.ClienteID || ''),
        identificacionNueva: identityValue.trim(),
        tipoIdentificacion: identityType,
        motivo: identityReason.trim(),
      })
      setIdentityTarget(null)
      setNotice('Identificación corregida y auditada. Los PDFs y facturas anteriores no cambian. Reemita el certificado normal en Inscripciones y el avalado aquí antes de enviarlos.')
      load()
    } catch (err) { setIdentityError(err.message); setError(err.message) }
    finally { setSaving(false) }
  }

  async function emitirAval(item) {
    setBusyId(item.ID)
    setError('')
    setNotice('')
    try {
      const issued = await api.emitirEntregableAval(item.ID)
      const certificate = issued.data
      if (!certificate.PdfHash) {
        const official = await api.getFirmasOficialesCertificado({
          templateVersion: certificate.TemplateVersion,
          managerSignatureSha256: certificate.InstitutionData?.managerSignatureSha256 || '',
        })
        const signatures = official.signatures
        const institutionAssets = {}
        let signers = official.signers
        if (certificate.TemplateVersion === AVAL_TEMPLATE_VERSION) {
          const snapshot = certificate.InstitutionData
          if (!snapshot?.authoritySignatureAssetId || !/^[a-f0-9]{64}$/i.test(snapshot.authoritySignatureSha256 || '')) {
            throw new Error('El snapshot emitido no incluye la firma institucional registrada.')
          }
          if (!snapshot.managerName || !snapshot.managerTitle || !/^[a-f0-9]{64}$/i.test(snapshot.managerSignatureSha256 || '')
            || String(official.signers?.manager?.signatureSha256 || '').toLowerCase() !== String(snapshot.managerSignatureSha256).toLowerCase()) {
            throw new Error('La firma o los datos del gerente ya no coinciden con el snapshot de emisión. El PDF no se generó para evitar un documento inconsistente.')
          }
          signers = { manager: { name: snapshot.managerName, title: snapshot.managerTitle } }
          const loadAsset = async (id, expectedHash, label, required = false) => {
            if (!id) {
              if (required) throw new Error(`Falta el recurso institucional obligatorio: ${label}.`)
              return ''
            }
            const response = await api.getArchivoInstitucionPrivado(id)
            const asset = response.data
            if (!asset || String(asset.sha256 || '').toLowerCase() !== String(expectedHash || '').toLowerCase()) {
              throw new Error(`El recurso privado de ${label} no coincide con el snapshot firmado.`)
            }
            if (!['image/png', 'image/jpeg'].includes(String(asset.mimeType || '').toLowerCase())) {
              throw new Error(`El formato del recurso privado de ${label} no es compatible con el PDF.`)
            }
            return `data:${asset.mimeType};base64,${asset.base64}`
          }
          const [authoritySignature, logo, seal] = await Promise.all([
            loadAsset(snapshot.authoritySignatureAssetId, snapshot.authoritySignatureSha256, 'firma de la autoridad institucional', true),
            loadAsset(snapshot.logoAssetId, snapshot.logoSha256, 'logotipo institucional'),
            loadAsset(snapshot.sealAssetId, snapshot.sealSha256, 'sello institucional'),
          ])
          Object.assign(institutionAssets, { authoritySignature, logo, seal })
        } else if (certificate.TemplateVersion !== LEGACY_AVAL_TEMPLATE_VERSION) {
          throw new Error('El certificado tiene un identificador de plantilla no reconocido. No se generó ningún PDF.')
        }
        const { buildCertificateV2Pdf } = await import('../../utils/certificateGeneratorV2')
        const pdfSource = certificate.CertificateStatus === 'pendiente_pdf'
          ? { ...certificate, CertificateStatus: 'emitido' }
          : certificate
        const prepared = await buildCertificateV2Pdf(pdfSource, { signatures, signers, institutionAssets })
        const pdfHash = await sha256Hex(prepared.blob)
        await api.guardarPdfEntregableAvalPrivado(item.ID, {
          pdfBase64: await blobToBase64(prepared.blob), pdfHash,
          templateVersion: certificate.TemplateVersion,
        })
        saveAs(prepared.blob, prepared.filename)
      } else {
        const archived = await api.leerPdfEntregableAvalPrivado(item.ID)
        const bytes = Uint8Array.from(atob(archived.contentBase64), ch => ch.charCodeAt(0))
        const blob = new Blob([bytes], { type: 'application/pdf' })
        if (await sha256Hex(blob) !== archived.hash) throw new Error('El PDF archivado no coincide con su huella SHA-256.')
        saveAs(blob, archived.filename)
      }
      setNotice('Certificado avalado archivado y descargado. El envío al participante sigue siendo una acción separada.')
      load()
    } catch (err) {
      setError(`${err.message} Si la emisión quedó registrada, use este mismo botón para reintentar sin crear otro código.`)
      load()
    } finally { setBusyId('') }
  }

  async function downloadAvalVersion(item, version) {
    setBusyId(item.ID)
    setError('')
    try {
      const archived = await api.leerPdfEntregableAvalPrivado(item.ID, version.id)
      const bytes = Uint8Array.from(atob(archived.contentBase64), character => character.charCodeAt(0))
      const blob = new Blob([bytes], { type: 'application/pdf' })
      if (await sha256Hex(blob) !== String(version.pdfHash || archived.hash || '').toLowerCase()) {
        throw new Error('El PDF histórico no coincide con la huella de la versión seleccionada.')
      }
      saveAs(blob, archived.filename)
      setNotice(`Se descargó el PDF original de la versión ${version.version}; no se regeneró el archivo.`)
    } catch (err) {
      setError(err.message || 'No se pudo recuperar el PDF histórico.')
    } finally { setBusyId('') }
  }

  async function enviarAval(e) {
    e.preventDefault()
    if (!deliveryTarget) return
    setBusyId(deliveryTarget.ID)
    setError('')
    setNotice('')
    try {
      const result = await api.enviarEntregableAvalEmail(deliveryTarget.ID, deliveryEmail.trim())
      setNotice(result.alreadySent ? 'Este certificado ya había sido enviado; no se duplicó el correo.' : 'Certificado avalado enviado con el PDF oficial archivado.')
      setDeliveryTarget(null)
      load()
    } catch (err) { setError(err.message) }
    finally { setBusyId('') }
  }

  async function changeAvalLifecycle(e) {
    e.preventDefault()
    if (!lifecycleTarget || !lifecycleConfirmed || lifecycleReason.trim().length < 5) return
    const { item, action } = lifecycleTarget
    setBusyId(item.ID)
    setError('')
    setNotice('')
    try {
      if (action === 'void') {
        await api.anularEntregableAval(item.ID, lifecycleReason.trim())
        setNotice('Certificado avalado anulado. El QR conservará la versión anterior como no vigente.')
      } else {
        await api.reemitirEntregableAval(item.ID, lifecycleReason.trim())
        setLifecycleTarget(null)
        setBusyId('')
        await emitirAval(item)
        return
      }
      setLifecycleTarget(null)
      load()
    } catch (err) { setError(err.message); load() }
    finally { setBusyId('') }
  }

  async function reconcileAvalDelivery(e) {
    e.preventDefault()
    if (!reconcileTarget || !reconcileResult || reconcileReason.trim().length < 5) return
    setBusyId(reconcileTarget.ID)
    setError('')
    try {
      await api.resolverEnvioEntregableAval(reconcileTarget.ID, reconcileResult, reconcileReason.trim())
      setNotice(reconcileResult === 'enviado' ? 'El envío quedó registrado como confirmado tras revisión.' : 'El envío se devolvió a pendiente tras confirmar que no salió ningún correo.')
      setReconcileTarget(null)
      load()
    } catch (err) { setError(err.message) }
    finally { setBusyId('') }
  }

  async function openPostIssueAvalConfiguration(item) {
    setError('')
    setNotice('')
    setConfigurationTarget(item)
    setInstitutionOptions([])
    setAgreementOptions([])
    setSelectedInstitutionId('')
    setSelectedAgreementId('')
    setConfigurationConfirmed(false)
    setConfigurationLoading(true)
    try {
      const result = await api.getOpcionesInstitucionesMaestras()
      setInstitutionOptions(result.data || [])
    } catch (err) {
      setError(err.message || 'No se pudo cargar la lista de instituciones.')
    } finally {
      setConfigurationLoading(false)
    }
  }

  async function changeConfigurationInstitution(institutionId) {
    setSelectedInstitutionId(institutionId)
    setSelectedAgreementId('')
    setAgreementOptions([])
    if (!institutionId) return
    setConfigurationLoading(true)
    setError('')
    try {
      const result = await api.getConveniosParaAval(institutionId)
      setAgreementOptions((result.data || []).filter(agreement => agreement.DisponibleParaAval !== false))
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los convenios vigentes.')
    } finally {
      setConfigurationLoading(false)
    }
  }

  async function configurePostIssueAval(e) {
    e.preventDefault()
    if (!configurationTarget || !selectedInstitutionId || !selectedAgreementId) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await api.configurarAvalPosteriorCertificado(configurationTarget.ID, {
        institucionId: selectedInstitutionId,
        convenioId: selectedAgreementId,
      })
      setConfigurationTarget(null)
      setNotice(result.alreadyConfigured
        ? 'La institución y el convenio ya estaban vinculados; no se duplicó ni se cambió el aval.'
        : `Aval posterior configurado con ${result.data?.institutionName || 'la institución seleccionada'}. El certificado normal permanece intacto.`)
      load()
    } catch (err) {
      setError(err.message || 'No se pudo configurar el aval posterior.')
    } finally {
      setSaving(false)
    }
  }

  async function downloadNormalCertificate(item, certificateVersionId = '') {
    setBusyId(`normal:${item.ID}`)
    setError('')
    setNotice('')
    const preview = openCertificatePreviewWindow()
    try {
      const result = await downloadCertificateWithAudit({
        id: item.ID,
        certificateVersionId,
        api,
        repository: certificatePdfRepository,
        preview,
        saveFile: saveAs,
      })
      if (result.previewWarning) setError(result.previewWarning)
      else setNotice(certificateVersionId
        ? `Se descargó el PDF original de la versión normal ${result.certificate?.CertificateVersion || ''}.`
        : 'Se descargó el certificado normal vigente; el archivo avalado se conserva por separado.')
    } catch (err) {
      setError(err.message || 'No se pudo descargar el certificado normal.')
    } finally {
      setBusyId('')
    }
  }

  async function openNormalCertificateHistory(item) {
    setNormalHistoryTarget(item)
    setNormalHistory([])
    setError('')
    setNormalHistoryLoading(true)
    setBusyId(`normal-history:${item.ID}`)
    try {
      const result = await api.getHistorialCertificados(item.ID)
      setNormalHistory(result.data || [])
    } catch (err) {
      setError(err.message || 'No se pudo cargar el historial del certificado normal.')
    } finally {
      setNormalHistoryLoading(false)
      setBusyId('')
    }
  }

  const pendientes   = filtered.filter(i => i.EstadoAval !== 'avalado').length
  const avalados     = filtered.filter(i => i.EstadoAval === 'avalado').length
  const totalConfirmado = filtered.reduce((s, i) => s + (i.EstadoAval === 'avalado' ? Number(i.ValorAval) || 0 : 0), 0)

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
          <p className="text-xl font-bold text-brand-700">{fmt.usd(totalConfirmado)}</p>
          <p className="text-xs text-gray-500">Total aval confirmado</p>
          <p className="mt-1 text-[10px] text-gray-400">No representa pagos registrados</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
      {notice && <p className="text-sm text-emerald-800 bg-emerald-50 rounded-lg p-3">{notice}</p>}

      {loading ? <Spinner text="Cargando certificados..." /> : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Fecha Curso','Participante','Servicio','Institución','Modalidad','Horas','Estado de Aval','Referencia','Regla / valor aval', ...(isAdmin ? ['Documentos de certificación'] : []), ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={isAdmin ? 11 : 10} className="text-center py-10 text-gray-400">Sin certificados con aval externo</td></tr>
                ) : filtered.map(i => (
                  <tr key={i.ID} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                      {fmt.date(i.FechaInicio)}{i.FechaFin ? ` — ${fmt.date(i.FechaFin)}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{i.ClienteNombre}</p>
                      {i.ClienteID && <p className="text-xs text-gray-400">Identificación: {i.ClienteID}</p>}
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
                      {i.EstadoAval === 'avalado' ? (
                        <div>
                          <p>{fmt.usd(i.ValorAval)}</p>
                          {i.AvalLegacy ? <p className="mt-1 whitespace-normal text-[10px] font-normal text-amber-700">Registro histórico sin desglose guardado</p> : (
                            <p className="mt-1 whitespace-normal text-[10px] font-normal text-gray-500">
                              {fmt.usd(i.AvalMontoBase)} × {Number(i.AvalPorcentajeAplicado)}%
                              <br />Base: {i.AvalBaseTipoAplicado === 'precio_servicio' ? 'precio del servicio' : 'monto de inscripción'}
                              {i.AvalConfirmadoPor && <><br />Confirmado por {i.AvalConfirmadoPor}</>}
                            </p>
                          )}
                        </div>
                      ) : i.AvalEstimacion ? (
                        <div>
                          <p>{fmt.usd(i.AvalEstimacion.monto)} <span className="text-[10px] font-normal text-gray-500">(estimado)</span></p>
                          <p className="mt-1 whitespace-normal text-[10px] font-normal text-gray-500">
                            {fmt.usd(i.AvalEstimacion.baseMonto)} × {Number(i.AvalEstimacion.porcentaje)}%
                            <br />Se congela al confirmar
                          </p>
                        </div>
                      ) : <span className="text-xs font-normal text-amber-700">Revisar convenio/regla</span>}
                    </td>
                    {isAdmin && <td className="px-4 py-3 min-w-[310px]">
                      <section className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-slate-800">Certificado normal</p>
                          {i.CertificadoNormal && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">{i.CertificadoNormal.CertificateStatus}</span>}
                        </div>
                        {i.CertificadoNormal ? <>
                          <p className="mt-1 break-all font-mono text-[11px] text-slate-600">{i.CertificadoNormal.CodigoCertificado} · V{i.CertificadoNormal.CertificateVersion}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <button type="button" className="btn-secondary text-xs px-2 py-1"
                              disabled={busyId === `normal:${i.ID}`} onClick={() => downloadNormalCertificate(i)}>
                              <Download size={13} /> Descargar normal
                            </button>
                            <button type="button" className="btn-secondary text-xs px-2 py-1"
                              disabled={busyId === `normal-history:${i.ID}`}
                              onClick={() => openNormalCertificateHistory(i)}>
                              <History size={13} /> Historial ({i.CertificadoNormal.VersionHistory?.length || 0})
                            </button>
                          </div>
                        </> : <p className="mt-1 text-[11px] text-slate-500">Aún no hay certificado normal vigente.</p>}
                      </section>

                      <section className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-slate-800">Certificado con aval</p>
                          {i.EntregableAval?.CertificateStatus && <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${i.EntregableAval.CertificateStatus === 'emitido' ? 'bg-emerald-100 text-emerald-800' : i.EntregableAval.CertificateStatus === 'anulado' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{i.EntregableAval.CertificateStatus}</span>}
                        </div>
                        {i.EntregableAval?.CodigoCertificado && <p className="mt-1 break-all font-mono text-[11px] text-slate-600">{i.EntregableAval.CodigoCertificado} · V{i.EntregableAval.CertificateVersion}</p>}
                        {i.EntregableAval?.PdfHash && <p className="mt-1 text-[10px] text-emerald-700">PDF oficial archivado y descargable</p>}
                        {i.EntregableAval?.RequiereReemisionIdentificacion && <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-900">La identificación actual difiere de la del PDF archivado. Conserve V1, cree y archive V2 antes de enviarla.</p>}
                        {i.EntregableAval?.CertificateStatus === 'anulado' ? (
                          <div>
                            <p className="mt-1 text-xs text-red-700">Documento avalado anulado; se conserva el histórico.</p>
                            {i.EntregableAval?.PdfHash && <button type="button" disabled={busyId === i.ID}
                              onClick={() => { setLifecycleTarget({ item: i, action: 'reissue' }); setLifecycleReason(''); setLifecycleConfirmed(false) }}
                              className="btn-secondary mt-2 text-xs px-2 py-1">Crear nueva versión</button>}
                          </div>
                        ) : i.EstadoAval === 'avalado' ? (
                          <>
                            {!i.EntregableAval?.PdfHash && <p className="mt-1 text-[11px] text-gray-500">Pendiente de emisión y archivo.</p>}
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <button type="button" disabled={busyId === i.ID || !i.AvalCodigoExterno}
                                onClick={() => emitirAval(i)} className="btn-secondary text-xs px-2 py-1">
                                <Download size={13} /> {i.EntregableAval?.RequiereReemisionIdentificacion ? 'Ver PDF anterior' : i.EntregableAval?.PdfHash ? 'Descargar avalado' : 'Emitir y descargar avalado'}
                              </button>
                              {i.EntregableAval?.PdfHash && !i.EntregableAval.RequiereReemisionIdentificacion && !['enviando', 'requiere_revision'].includes(i.EntregableAval.EstadoEntregaFinal) && <button type="button" disabled={busyId === i.ID || i.EntregableAval.EstadoEntregaFinal === 'enviado'}
                                onClick={() => { setDeliveryTarget(i); setDeliveryEmail(i.ClienteEmail || '') }} className="btn-primary text-xs px-2 py-1">
                                {i.EntregableAval.EstadoEntregaFinal === 'enviado' ? 'Enviado' : 'Enviar por correo'}
                              </button>}
                              {i.EntregableAval?.PdfHash && ['enviando', 'requiere_revision'].includes(i.EntregableAval.EstadoEntregaFinal) &&
                                <button type="button" disabled={busyId === i.ID}
                                  onClick={() => { setReconcileTarget(i); setReconcileResult(''); setReconcileReason('') }}
                                  className="btn-secondary text-xs px-2 py-1 text-amber-800">Revisar envío</button>}
                              {i.EntregableAval?.PdfHash && ['emitido', 'anulado'].includes(i.EntregableAval.CertificateStatus) && <button type="button" disabled={busyId === i.ID}
                                onClick={() => { setLifecycleTarget({ item: i, action: 'reissue' }); setLifecycleReason(''); setLifecycleConfirmed(false) }}
                                className="btn-secondary text-xs px-2 py-1">Crear nueva versión</button>}
                              {i.EntregableAval?.VersionHistory?.length > 0 && <button type="button" disabled={busyId === i.ID}
                                onClick={() => setHistoryTarget(i)} className="btn-secondary text-xs px-2 py-1">
                                <History size={13} /> Historial aval ({i.EntregableAval.VersionHistory.length})
                              </button>}
                              {i.EntregableAval?.PdfHash && <button type="button" disabled={busyId === i.ID}
                                onClick={() => { setLifecycleTarget({ item: i, action: 'void' }); setLifecycleReason(''); setLifecycleConfirmed(false) }}
                                className="btn-secondary text-xs px-2 py-1 text-red-700">Anular</button>}
                            </div>
                          </>
                        ) : <>
                          <p className="mt-1 text-[11px] text-gray-500">{i.PuedeConfigurarAvalPosterior
                            ? 'Upgrade CRM pagado y certificado normal vigente.'
                            : 'Pendiente de seleccionar/configurar y confirmar el aval.'}</p>
                          {i.PuedeConfigurarAvalPosterior && <button type="button" disabled={configurationLoading || busyId === i.ID}
                            onClick={() => openPostIssueAvalConfiguration(i)} className="btn-primary mt-2 text-xs px-2.5 py-1.5">
                            <Pencil size={12} /> Configurar aval posterior
                          </button>}
                        </>}
                      </section>
                    </td>}
                    <td className="px-4 py-3">
                      {i.EstadoAval !== 'avalado' ? (
                        <button onClick={() => openAval(i)} className="btn-primary text-xs px-3 py-1.5">
                          Confirmar aval
                        </button>
                      ) : isAdmin ? (
                        <div className="flex flex-wrap gap-1.5">
                          <button onClick={() => { setCorrectionTarget(i); setCorrectionReason(''); setCorrectionConfirmed(false) }}
                            className="btn-secondary text-xs px-3 py-1.5" title="Corrección excepcional auditada">
                            <Pencil size={12} /> Corregir código
                          </button>
                          {i.EntregableAval?.PdfHash && ['emitido', 'anulado'].includes(i.EntregableAval.CertificateStatus) &&
                            <button type="button" onClick={() => {
                              setIdentityTarget(i); setIdentityValue(String(i.ClienteID || ''))
                              setIdentityType(['CEDULA_EC', 'RUC_EC', 'PASAPORTE', 'OTRO'].includes(i.ClienteTipoIdentificacion)
                                ? i.ClienteTipoIdentificacion : 'CEDULA_EC')
                              setIdentityReason(''); setIdentityConfirmed(false)
                              setIdentityError('')
                            }} className="btn-secondary text-xs px-3 py-1.5" title="Corrige la identificación fuente; los PDFs anteriores se conservan">
                              <Pencil size={12} /> Corregir identificación
                            </button>}
                        </div>
                      ) : <span className="text-xs text-emerald-700">Confirmado · bloqueado</span>}
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
            {avalTarget.AvalEstimacion ? (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-800">Cálculo automático por certificado</p>
                <p className="mt-2 text-sm text-gray-700">
                  {fmt.usd(avalTarget.AvalEstimacion.baseMonto)} × {Number(avalTarget.AvalEstimacion.porcentaje)}% = <strong className="text-indigo-800">{fmt.usd(avalTarget.AvalEstimacion.monto)}</strong>
                </p>
                <p className="mt-1 text-xs text-gray-600">
                  Base: {avalTarget.AvalEstimacion.baseTipo === 'precio_servicio' ? 'precio del catálogo del servicio' : 'monto registrado en la inscripción'}. El servidor calculará de nuevo al confirmar y guardará la condición aplicada.
                </p>
              </div>
            ) : (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                No se pudo calcular una vista previa. Verifique que la inscripción tenga un convenio vigente y regla económica configurada; no se aceptará un monto manual.
              </p>
            )}
            <div>
              <label className="label">Referencia del aval</label>
              <input className="input" value={referencia} onChange={e => setReferencia(e.target.value)}
                placeholder="Ej.: AVAL-2026-0031" />
            </div>
            <div>
              <label className="label">Enlace de validación externo</label>
              <input className="input" type="url" value={enlaceExterno} onChange={e => setEnlaceExterno(e.target.value)}
                placeholder="https://institucion.example/verificar/..." />
              <p className="text-xs text-gray-500 mt-1">Se mostrará como direccionamiento externo. No se generará un segundo QR.</p>
            </div>
            <div>
              <label className="label">Código externo / Ministerio</label>
              <input className="input" maxLength={64} value={codigoExterno} onChange={e => setCodigoExterno(e.target.value)}
                placeholder="Código emitido por la institución" />
              <p className="text-xs text-gray-500 mt-1">Debe registrar al menos una referencia, código o enlace para confirmar el aval.</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setAvalTarget(null)} className="btn-secondary flex-1">Cancelar</button>
              <button type="submit" disabled={saving || !avalTarget.AvalEstimacion} className="btn-primary flex-1">
                {saving ? 'Guardando...' : 'Confirmar Aval'}
              </button>
            </div>
          </form>
        )}
      </Modal>
      <Modal open={!!configurationTarget} onClose={() => setConfigurationTarget(null)} title="Configurar aval posterior" size="md">
        {configurationTarget && <form onSubmit={configurePostIssueAval} className="space-y-4">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-950">
            <p className="font-semibold">El certificado normal se conservará sin cambios.</p>
            <p className="mt-1">Esta acción únicamente habilita el trámite del segundo documento, con aval institucional, para la misma inscripción.</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <p><strong>Participante:</strong> {configurationTarget.ClienteNombre}</p>
            <p><strong>Curso:</strong> {configurationTarget.ServicioNombre}</p>
            <p className="mt-1 break-all font-mono text-xs text-slate-600">
              Certificado normal: {configurationTarget.CertificadoNormal?.CodigoCertificado || '—'} · V{configurationTarget.CertificadoNormal?.CertificateVersion || 1}
            </p>
            {configurationTarget.AvalUpgradeCRMOrderID && <p className="mt-1 text-xs text-slate-500">Upgrade CRM verificado: {configurationTarget.AvalUpgradeCRMOrderID}</p>}
          </div>
          <div>
            <label className="label" htmlFor="post-issue-institution">Institución avaladora</label>
            <select id="post-issue-institution" className="input" required value={selectedInstitutionId}
              disabled={configurationLoading || institutionOptions.length === 0}
              onChange={event => changeConfigurationInstitution(event.target.value)}>
              <option value="">Seleccione una institución…</option>
              {institutionOptions.map(institution => <option key={institution.ID} value={institution.ID}>{institution.Nombre}{institution.Siglas ? ` (${institution.Siglas})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="post-issue-agreement">Convenio vigente y regla económica</label>
            <select id="post-issue-agreement" className="input" required value={selectedAgreementId}
              disabled={configurationLoading || !selectedInstitutionId || agreementOptions.length === 0}
              onChange={event => setSelectedAgreementId(event.target.value)}>
              <option value="">{selectedInstitutionId ? 'Seleccione un convenio…' : 'Primero elija la institución…'}</option>
              {agreementOptions.map(agreement => <option key={agreement.ID} value={agreement.ID}>
                {agreement.Objeto || agreement.ID}{agreement.PorcentajeAval !== '' && agreement.PorcentajeAval !== undefined ? ` · ${agreement.PorcentajeAval}%` : ''}
              </option>)}
            </select>
            {selectedInstitutionId && !configurationLoading && agreementOptions.length === 0 && <p className="mt-1 text-xs text-amber-700">No hay convenios vigentes configurados para calcular este aval.</p>}
          </div>
          {configurationLoading && <p role="status" className="text-xs text-slate-500">Cargando instituciones y convenios…</p>}
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5" checked={configurationConfirmed} onChange={event => setConfigurationConfirmed(event.target.checked)} />
            <span>Confirmo que la selección corresponde al aval solicitado y que el certificado normal debe permanecer intacto.</span>
          </label>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-end">
            <button type="button" className="btn-secondary" onClick={() => setConfigurationTarget(null)}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving || configurationLoading || !selectedInstitutionId || !selectedAgreementId || !configurationConfirmed}>
              {saving ? 'Configurando…' : 'Continuar con el aval'}
            </button>
          </div>
        </form>}
      </Modal>
      <Modal open={!!normalHistoryTarget} onClose={() => setNormalHistoryTarget(null)} title="Historial del certificado normal" size="lg">
        {normalHistoryTarget && <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="font-semibold text-slate-900">{normalHistoryTarget.ClienteNombre}</p>
            <p className="mt-1 text-sm text-slate-600">{normalHistoryTarget.ServicioNombre}</p>
            <p className="mt-2 text-xs text-slate-600">Este historial corresponde solo al certificado normal. Las versiones y archivos del certificado avalado se administran por separado.</p>
          </div>
          {normalHistoryLoading ? <Spinner text="Cargando historial normal…" /> : normalHistory.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">No se encontraron versiones normales en el historial.</p>
          ) : <ol className="space-y-3">
            {normalHistory.map(version => {
              const current = ['emitido', 'enviado'].includes(String(version.estado || '').toLowerCase())
              return <li key={version.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">Versión {version.version}</p>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${current ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{version.estado}</span>
                      {current && <span className="text-xs font-medium text-emerald-700">Vigente</span>}
                    </div>
                    <p className="mt-1 break-all font-mono text-xs text-slate-600">{version.codigo}</p>
                    <p className="mt-2 text-xs text-slate-500">{version.fecha ? fmt.date(version.fecha) : 'Fecha no registrada'}{version.actor ? ` · por ${version.actor}` : ''}</p>
                  </div>
                  <button type="button" className="btn-secondary shrink-0 text-xs" disabled={!version.pdfArchivado || !!busyId}
                    title={!version.pdfArchivado ? 'No hay PDF histórico archivado para esta versión.' : 'Descargar exactamente el PDF archivado'}
                    onClick={() => downloadNormalCertificate(normalHistoryTarget, version.id)}>
                    <Download size={14} /> {version.pdfArchivado ? 'Descargar PDF original' : 'PDF no archivado'}
                  </button>
                </div>
                <dl className="mt-3 grid gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-xs sm:grid-cols-2">
                  <div><dt className="text-slate-400">Plantilla</dt><dd className="mt-0.5 break-all text-slate-700">{version.plantilla || 'No registrada'}</dd></div>
                  {version.motivo && <div className="sm:col-span-2"><dt className="text-slate-400">Motivo</dt><dd className="mt-0.5 text-slate-700">{version.motivo}</dd></div>}
                  {!version.pdfArchivado && <div className="sm:col-span-2 text-amber-800">El sistema no regenerará este histórico con una plantilla actual.</div>}
                </dl>
              </li>
            })}
          </ol>}
          <div className="flex justify-end border-t border-slate-100 pt-3">
            <button type="button" className="btn-secondary" onClick={() => setNormalHistoryTarget(null)}>Cerrar</button>
          </div>
        </div>}
      </Modal>
      <Modal open={!!historyTarget} onClose={() => setHistoryTarget(null)} title="Historial de versiones del aval" size="lg">
        {historyTarget && <div className="space-y-4">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-4">
            <p className="font-semibold text-slate-900">{historyTarget.ClienteNombre}</p>
            <p className="mt-1 text-sm text-slate-600">{historyTarget.ServicioNombre} · {historyTarget.InstitucionAval || 'Institución no registrada'}</p>
            <p className="mt-2 text-xs text-indigo-900">El valor confirmado del aval pertenece al registro original y no se recalcula al consultar o descargar versiones.</p>
          </div>
          {(historyTarget.EntregableAval?.VersionHistory || []).some(version => version.estado === 'pendiente_pdf') && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Hay una nueva versión pendiente de archivo; la versión anterior mantiene la vigencia.</p>}
          <ol className="space-y-3">
            {(historyTarget.EntregableAval?.VersionHistory || []).map(version => {
              const vigente = ['emitido', 'enviado'].includes(String(version.estado || '').toLowerCase())
              return <li key={version.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">Versión {version.version}</p>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${vigente ? 'bg-emerald-100 text-emerald-800' : version.estado === 'pendiente_pdf' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{version.estado}</span>
                      {vigente && <span className="text-xs font-medium text-emerald-700">Vigente</span>}
                    </div>
                    <p className="mt-1 break-all font-mono text-xs text-slate-600">{version.codigo}</p>
                    <p className="mt-2 text-xs text-slate-500">{version.issuedAt ? fmt.date(version.issuedAt) : 'Fecha no registrada'}{version.issuedBy ? ` · por ${version.issuedBy}` : ''}</p>
                  </div>
                  <button type="button" className="btn-secondary shrink-0 text-xs" disabled={!version.pdfArchived || busyId === historyTarget.ID}
                    title={!version.pdfArchived ? 'No hay PDF histórico archivado para esta versión.' : 'Descargar exactamente el PDF archivado'}
                    onClick={() => downloadAvalVersion(historyTarget, version)}>
                    <Download size={14} /> {version.pdfArchived ? 'Descargar PDF original' : 'PDF no archivado'}
                  </button>
                </div>
                <dl className="mt-3 grid gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-xs sm:grid-cols-2">
                  <div><dt className="text-slate-400">Plantilla</dt><dd className="mt-0.5 break-all text-slate-700">{version.templateVersion || 'No registrada'}</dd></div>
                  {version.reason && <div className="sm:col-span-2"><dt className="text-slate-400">Motivo registrado</dt><dd className="mt-0.5 text-slate-700">{version.reason}</dd></div>}
                  {!version.pdfArchived && <div className="sm:col-span-2 text-amber-800">No se regenerará con una plantilla actual: el original no está archivado.</div>}
                </dl>
              </li>
            })}
          </ol>
          <div className="flex justify-end border-t border-slate-100 pt-3">
            <button type="button" className="btn-secondary" onClick={() => setHistoryTarget(null)}>Cerrar</button>
          </div>
        </div>}
      </Modal>
      <Modal open={!!correctionTarget} onClose={() => setCorrectionTarget(null)} title="Corrección administrativa del aval" size="sm">
        {correctionTarget && <form onSubmit={handleCorrectConfirmedAval} className="space-y-4">
          <p className="text-sm text-gray-600">
            Esta excepción solo corrige referencia, enlace o código antes de emitir/archivar el PDF. No modifica institución, convenio, porcentaje, base ni valor calculado.
          </p>
          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
            <p><strong>Participante:</strong> {correctionTarget.ClienteNombre}</p>
            <p><strong>Código vigente:</strong> {correctionTarget.AvalCodigoExterno || '—'}</p>
            <p><strong>Valor histórico:</strong> {fmt.usd(correctionTarget.ValorAval)}</p>
          </div>
          <div><label className="label" htmlFor="aval-correction-code">Código institucional corregido</label>
            <input id="aval-correction-code" className="input" maxLength={64} value={correctionTarget.AvalCodigoExterno || ''}
              onChange={e => setCorrectionTarget(current => ({ ...current, AvalCodigoExterno: e.target.value }))} /></div>
          <div><label className="label" htmlFor="aval-correction-reference">Referencia</label>
            <input id="aval-correction-reference" className="input" value={correctionTarget.AvalReferencia || ''}
              onChange={e => setCorrectionTarget(current => ({ ...current, AvalReferencia: e.target.value }))} /></div>
          <div><label className="label" htmlFor="aval-correction-link">Enlace externo</label>
            <input id="aval-correction-link" className="input" type="url" value={correctionTarget.AvalEnlaceExterno || ''}
              onChange={e => setCorrectionTarget(current => ({ ...current, AvalEnlaceExterno: e.target.value }))} /></div>
          <div><label className="label" htmlFor="aval-correction-reason">Motivo obligatorio (mínimo 10 caracteres)</label>
            <textarea id="aval-correction-reason" className="input" required minLength={10} value={correctionReason}
              onChange={e => setCorrectionReason(e.target.value)} placeholder="Explique por qué se corrige el dato confirmado…" /></div>
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={correctionConfirmed} onChange={e => setCorrectionConfirmed(e.target.checked)} />
            Confirmo la corrección y que debe quedar registrada en auditoría.
          </label>
          <div className="flex gap-3">
            <button type="button" onClick={() => setCorrectionTarget(null)} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={saving || !correctionConfirmed || correctionReason.trim().length < 10} className="btn-primary flex-1">
              {saving ? 'Guardando…' : 'Guardar corrección'}
            </button>
          </div>
        </form>}
      </Modal>
      <Modal open={!!identityTarget} onClose={() => setIdentityTarget(null)} title="Corregir identificación del participante" size="sm">
        {identityTarget && <form onSubmit={handleCorrectIdentity} className="space-y-4">
          {identityError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{identityError}</p>}
          <p className="text-sm text-slate-700">Corrija el dato fuente de <strong>{identityTarget.ClienteNombre}</strong>. La versión archivada y las facturas emitidas permanecen intactas.</p>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Después de guardar, reemita y archive el certificado normal en Inscripciones y el avalado aquí. Hasta entonces no envíe el PDF anterior al participante.
          </div>
          <p className="text-xs text-slate-500">Identificación actual: <span className="font-mono font-semibold text-slate-800">{identityTarget.ClienteID || 'Sin registrar'}</span></p>
          <div><label className="label" htmlFor="aval-identity-type">Tipo de identificación</label>
            <select id="aval-identity-type" className="input" required value={identityType} onChange={e => setIdentityType(e.target.value)}>
              <option value="CEDULA_EC">Cédula ecuatoriana</option><option value="RUC_EC">RUC</option>
              <option value="PASAPORTE">Pasaporte</option><option value="OTRO">Otro documento</option>
            </select></div>
          <div><label className="label" htmlFor="aval-identity-value">Identificación corregida</label>
            <input id="aval-identity-value" className="input font-mono" type="text" inputMode="text" required maxLength={64}
              value={identityValue} onChange={e => setIdentityValue(e.target.value)} autoComplete="off" /></div>
          <div><label className="label" htmlFor="aval-identity-reason">Motivo y respaldo de la corrección</label>
            <textarea id="aval-identity-reason" className="input" required minLength={10} value={identityReason}
              onChange={e => setIdentityReason(e.target.value)} placeholder="Ej.: Cédula cotejada con el documento presentado por la persona…" /></div>
          <label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={identityConfirmed}
            onChange={e => setIdentityConfirmed(e.target.checked)} /> Confirmo que verifiqué el documento y que las versiones anteriores no se modificarán.</label>
          <div className="flex gap-3"><button type="button" onClick={() => setIdentityTarget(null)} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={saving || !identityConfirmed || identityReason.trim().length < 10}
              className="btn-primary flex-1">{saving ? 'Guardando…' : 'Guardar corrección'}</button></div>
        </form>}
      </Modal>
      <Modal open={!!deliveryTarget} onClose={() => setDeliveryTarget(null)} title="Enviar certificado avalado" size="sm">
        {deliveryTarget && <form className="space-y-4" onSubmit={enviarAval}>
          <p className="text-sm text-gray-600">Se enviará únicamente el PDF oficial archivado de <strong>{deliveryTarget.ClienteNombre}</strong>, con el código externo <strong>{deliveryTarget.AvalCodigoExterno}</strong>.</p>
          <div><label className="label" htmlFor="aval-delivery-email">Correo del participante</label>
            <input id="aval-delivery-email" className="input" type="email" required value={deliveryEmail} onChange={e => setDeliveryEmail(e.target.value)} /></div>
          <div className="flex gap-3"><button type="button" className="btn-secondary flex-1" onClick={() => setDeliveryTarget(null)}>Cancelar</button>
            <button type="submit" disabled={!!busyId} className="btn-primary flex-1">{busyId ? 'Enviando…' : 'Confirmar envío'}</button></div>
        </form>}
      </Modal>
      <Modal open={!!lifecycleTarget} onClose={() => setLifecycleTarget(null)}
        title={lifecycleTarget?.action === 'void' ? 'Anular certificado avalado' : 'Crear nueva versión del certificado'} size="sm">
        {lifecycleTarget && <form className="space-y-4" onSubmit={changeAvalLifecycle}>
          <p className="text-sm text-gray-600">{lifecycleTarget.action === 'void'
            ? 'El QR conservará la versión como anulada. El PDF histórico no se borra.'
            : 'Se conservará el PDF anterior y se creará un nuevo código y versión. El código externo confirmado no se altera.'}</p>
          <div><label htmlFor="aval-lifecycle-reason" className="label">Motivo documentado</label>
            <textarea id="aval-lifecycle-reason" className="input" required minLength={5} value={lifecycleReason}
              onChange={e => setLifecycleReason(e.target.value)} /></div>
          <label className="flex items-start gap-2 text-sm text-gray-700"><input type="checkbox" checked={lifecycleConfirmed}
            onChange={e => setLifecycleConfirmed(e.target.checked)} /> Confirmo esta acción administrativa y su registro en auditoría.</label>
          <div className="flex gap-3"><button type="button" className="btn-secondary flex-1" onClick={() => setLifecycleTarget(null)}>Cancelar</button>
            <button type="submit" disabled={!lifecycleConfirmed || lifecycleReason.trim().length < 5 || !!busyId}
              className="btn-primary flex-1">{busyId ? 'Procesando…' : lifecycleTarget.action === 'void' ? 'Anular' : 'Crear nueva versión'}</button></div>
        </form>}
      </Modal>
      <Modal open={!!reconcileTarget} onClose={() => setReconcileTarget(null)} title="Revisar envío incierto" size="sm">
        {reconcileTarget && <form className="space-y-4" onSubmit={reconcileAvalDelivery}>
          <p className="text-sm text-amber-800 bg-amber-50 rounded-lg p-3">Antes de elegir, compruebe el correo saliente de la cuenta emisora. No pulse «Enviar» nuevamente sin esta revisión.</p>
          <div><label className="label" htmlFor="aval-reconcile-result">Resultado comprobado</label>
            <select id="aval-reconcile-result" className="input" required value={reconcileResult} onChange={e => setReconcileResult(e.target.value)}>
              <option value="">Seleccione…</option><option value="enviado">El correo sí salió</option>
              <option value="no_enviado">Confirmé que no salió</option>
            </select></div>
          <div><label className="label" htmlFor="aval-reconcile-reason">Observación de la revisión</label>
            <textarea id="aval-reconcile-reason" className="input" required minLength={5} value={reconcileReason}
              onChange={e => setReconcileReason(e.target.value)} /></div>
          <div className="flex gap-3"><button type="button" className="btn-secondary flex-1" onClick={() => setReconcileTarget(null)}>Cancelar</button>
            <button type="submit" disabled={!reconcileResult || reconcileReason.trim().length < 5 || !!busyId}
              className="btn-primary flex-1">{busyId ? 'Guardando…' : 'Registrar revisión'}</button></div>
        </form>}
      </Modal>
    </div>
  )
}
